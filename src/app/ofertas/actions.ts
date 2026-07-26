'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ofertaSchema } from '@/lib/validation/oferta'
import { intencionSchema } from '@/lib/validation/intencion'
import { notificarNuevaIntencion } from '@/lib/notificaciones/intencion'
import { notificarAceptacion } from '@/lib/notificaciones/aceptacion'
import { notificarTelegram } from '@/lib/telegram/notificar'
import { enviarCorreo } from '@/lib/resend/cliente'
import { ciudadesDelGrupo } from '@/lib/data/areas-metropolitanas'
import { mensajeDesdeError } from '@/lib/ofertas/mensaje-error'
import { chatIdsDe, chatIdsPorUsuarios } from '@/lib/telegram/vinculacion'

export type AccionState = { error: string | null; mensaje?: string }

export async function publicarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const parsed = ofertaSchema.safeParse({
    operacion: formData.get('operacion'),
    moneda: formData.get('moneda'),
    cantidad: formData.get('cantidad'),
    precioCop: formData.get('precioCop'),
    condiciones: formData.getAll('condiciones'),
    sede: formData.get('sede'),
    notas: formData.get('notas'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('razon_social, ciudad')
    .eq('id', user.id)
    .single()

  const destacar = formData.get('destacar') === 'on'

  const d = parsed.data
  const { data: nuevaOferta, error } = await supabase.from('ofertas').insert({
    usuario_id: user.id,
    empresa: perfil?.razon_social ?? '',
    ciudad: perfil?.ciudad ?? null,
    sede: d.sede || null,
    operacion: d.operacion,
    moneda: d.moneda,
    cantidad: Number(d.cantidad),
    precio_cop: Number(d.precioCop),
    condiciones: d.condiciones,
    estado: 'activa',
    notas: d.notas || null,
  }).select('id').single()

  if (error) return { error: mensajeDesdeError(error) }

  if (destacar && nuevaOferta) {
    const { error: errorDestacar } = await supabase.rpc('destacar_oferta', { p_oferta_id: nuevaOferta.id })
    if (errorDestacar) {
      return {
        error: `La oferta se publicó, pero no se pudo destacar: ${mensajeDesdeError(errorDestacar, 'No tiene saldo suficiente de tokens para destacarla. Puede destacarla después desde "Mis ofertas" cuando tenga saldo.')}`,
      }
    }
  }

  await notificarTelegram(
    `📢 <b>Nueva oferta publicada</b>\n${perfil?.razon_social ?? 'Empresa'}: ${d.operacion === 'venta' ? 'Vende' : 'Compra'} ${d.moneda} ${Number(d.cantidad).toLocaleString('es-CO')}\nPrecio: $${Number(d.precioCop).toLocaleString('es-CO')} COP`
  )

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  return { error: null }
}

export async function eliminarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ofertas')
    .update({ estado: 'eliminada' })
    .eq('id', ofertaId)
    .select('id')
    .single()

  if (error) return { error: 'No se pudo eliminar la oferta.' }

  await supabase
    .from('intenciones')
    .update({ estado: 'cerrada' })
    .eq('oferta_id', ofertaId)
    .in('estado', ['enviada', 'vista', 'aceptada'])

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/admin/operaciones')
  return { error: null }
}

export async function completarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('completar_oferta', { p_oferta_id: ofertaId })

  if (error) return { error: mensajeDesdeError(error) }

  revalidatePath('/ofertas/mis-ofertas')
  return { error: null }
}

export async function cerrarNegociacionSinAcuerdo(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cerrar_negociacion_sin_acuerdo', { p_oferta_id: ofertaId })

  if (error) return { error: mensajeDesdeError(error) }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}

export async function realizarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  const parsed = intencionSchema.safeParse({
    tipo: formData.get('tipo'),
    comentarios: formData.get('comentarios'),
  })

  if (!ofertaId) return { error: 'Solicitud inválida.' }
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const d = parsed.data
  const { error } = await supabase.from('intenciones').insert({
    oferta_id: ofertaId,
    usuario_id: user.id,
    tipo: d.tipo,
    comentarios: d.comentarios || null,
    estado: 'enviada',
  })

  if (error) return { error: mensajeDesdeError(error) }

  // Notificar al dueño de la oferta. No puede fallar la respuesta (enviarCorreo nunca lanza), pero sí se espera antes de responder.
  const [{ data: oferta }, { data: quienResponde }] = await Promise.all([
    supabase.from('ofertas').select('usuario_id, empresa, operacion, moneda, cantidad, precio_cop').eq('id', ofertaId).single(),
    supabase.from('perfiles_publicos')
      .select('razon_social, contacto_nombre, contacto_celular, contacto_correo')
      .eq('id', user.id)
      .single(),
  ])
  if (oferta) {
    const { data: dueno } = await supabase
      .from('perfiles_publicos')
      .select('correo')
      .eq('id', oferta.usuario_id)
      .single()
    if (dueno && quienResponde) {
      await notificarNuevaIntencion({
        correoDueno: dueno.correo,
        empresaRespondio: quienResponde.razon_social,
        contactoRespondio: quienResponde.contacto_nombre,
        celularRespondio: quienResponde.contacto_celular,
        correoRespondio: quienResponde.contacto_correo,
        tipo: d.tipo,
        comentarios: d.comentarios || null,
        operacionOferta: oferta.operacion,
        monedaOferta: oferta.moneda,
        cantidadOferta: oferta.cantidad,
        precioOferta: oferta.precio_cop,
      })
    }
    const resumenOferta = `${oferta.operacion === 'venta' ? 'Vende' : 'Compra'} ${oferta.moneda} ${oferta.cantidad.toLocaleString('es-CO')} a $${oferta.precio_cop.toLocaleString('es-CO')} COP`

    await notificarTelegram(
      `🤝 <b>Intención registrada</b>\n${quienResponde?.razon_social ?? 'Un usuario'} respondió a la oferta de ${oferta.empresa} (${resumenOferta})`
    )

    // Aviso directo a cada Telegram vinculado del dueño de la oferta (puede
    // haber hasta 3 personas vinculadas por esa empresa).
    if (quienResponde) {
      const chatIdsDueno = await chatIdsDe(oferta.usuario_id)
      await Promise.all(chatIdsDueno.map((chatId) => notificarTelegram(
        `🤝 <b>Nueva intención sobre su oferta</b>\nSu oferta: ${resumenOferta}\n${quienResponde.razon_social} — ${quienResponde.contacto_nombre} · ${quienResponde.contacto_celular} · ${quienResponde.contacto_correo}\n\nEntre a Tasa Directa para ver el detalle.`,
        chatId
      )))
    }
  }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}

export async function aceptarIntencion(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const intencionId = String(formData.get('intencionId') ?? '')
  if (!intencionId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  // Lee los datos ANTES del RPC para poder notificar por correo (el RPC hace
  // el commit atómico: intención=aceptada + oferta=completada + resto=cerrada).
  const { data: intencion } = await supabase
    .from('intenciones')
    .select('id, usuario_id, oferta_id')
    .eq('id', intencionId)
    .single()
  if (!intencion) return { error: 'Intención no encontrada.' }

  const [{ data: oferta }, { data: quienResponde }, { data: dueno }] = await Promise.all([
    supabase.from('ofertas')
      .select('operacion, moneda, cantidad, precio_cop')
      .eq('id', intencion.oferta_id).single(),
    supabase.from('perfiles_publicos')
      .select('correo').eq('id', intencion.usuario_id).single(),
    supabase.from('perfiles_publicos')
      .select('razon_social, contacto_nombre, contacto_celular, contacto_correo')
      .eq('id', user.id).single(),
  ])

  const { error } = await supabase.rpc('aceptar_intencion', { p_intencion_id: intencionId })
  if (error) return { error: mensajeDesdeError(error) }

  if (oferta && quienResponde && dueno) {
    await notificarAceptacion({
      correoRespondio: quienResponde.correo,
      empresaDueno: dueno.razon_social,
      contactoDueno: dueno.contacto_nombre,
      celularDueno: dueno.contacto_celular,
      correoDueno: dueno.contacto_correo,
      operacionOferta: oferta.operacion,
      monedaOferta: oferta.moneda,
      cantidadOferta: oferta.cantidad,
      precioOferta: oferta.precio_cop,
    })
    const resumenOferta = `${oferta.operacion === 'venta' ? 'Vende' : 'Compra'} ${oferta.moneda} ${oferta.cantidad.toLocaleString('es-CO')} a $${oferta.precio_cop.toLocaleString('es-CO')} COP`
    await notificarTelegram(
      `✅ <b>Oferta aceptada</b>\n${dueno.razon_social} aceptó la intención de ${quienResponde.correo} (${resumenOferta})`
    )

    // Aviso directo a cada Telegram vinculado de quien respondió.
    const chatIdsRespondio = await chatIdsDe(intencion.usuario_id)
    await Promise.all(chatIdsRespondio.map((chatId) => notificarTelegram(
      `✅ <b>Su intención fue aceptada</b>\n${dueno.razon_social} aceptó su respuesta a la oferta: ${resumenOferta}\nContacto: ${dueno.contacto_nombre} · ${dueno.contacto_celular} · ${dueno.contacto_correo}\n\nContáctelos directamente para cerrar la operación.`,
      chatId
    )))
  }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}

export async function destacarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('destacar_oferta', { p_oferta_id: ofertaId })

  if (error) {
    return { error: mensajeDesdeError(error, 'No tiene saldo suficiente de tokens para destacar esta oferta.') }
  }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  return { error: null, mensaje: 'Oferta destacada. Ya aparece arriba en el tablero.' }
}

export async function enviarAlertaCiudad(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const [{ data: oferta }, { data: perfil }] = await Promise.all([
    supabase.from('ofertas')
      .select('usuario_id, empresa, operacion, moneda, cantidad, precio_cop, estado')
      .eq('id', ofertaId).single(),
    supabase.from('perfiles_usuarios').select('ciudad').eq('id', user.id).single(),
  ])

  if (!oferta || oferta.usuario_id !== user.id) return { error: 'Oferta no encontrada.' }
  if (oferta.estado !== 'activa') {
    return { error: 'Solo se puede enviar la alerta mientras la oferta está activa (aún sin negociación en curso).' }
  }
  if (!perfil?.ciudad) {
    return { error: 'Su perfil no tiene ciudad registrada. Actualícela en "Ver y editar" antes de usar este servicio.' }
  }

  const { error: errorConsumo } = await supabase.rpc('consumir_tokens', {
    p_cantidad: 1,
    p_concepto: 'alerta_premium',
    p_referencia: ofertaId,
  })
  if (errorConsumo) {
    return { error: mensajeDesdeError(errorConsumo, 'No tiene saldo suficiente de tokens para enviar esta alerta.') }
  }

  const resumenOferta = `${oferta.operacion === 'venta' ? 'Vende' : 'Compra'} ${oferta.moneda} ${oferta.cantidad.toLocaleString('es-CO')} a $${oferta.precio_cop.toLocaleString('es-CO')} COP`
  const ciudades = ciudadesDelGrupo(perfil.ciudad)

  // Se usa el cliente de servicio: hay que leer membresía activa de OTROS
  // usuarios, invisible para un usuario normal vía RLS.
  const service = createServiceClient()
  const [{ data: candidatos }, { data: membresiasActivas }] = await Promise.all([
    service.from('perfiles_usuarios')
      .select('id, razon_social, correo')
      .eq('estado', 'aprobado')
      .in('ciudad', ciudades)
      .neq('id', user.id),
    service.from('membresias').select('usuario_id').eq('estado', 'activa'),
  ])

  const idsConMembresia = new Set((membresiasActivas ?? []).map((m) => m.usuario_id))
  const destinatarios = (candidatos ?? []).filter((c) => idsConMembresia.has(c.id))

  const mensaje = `📍 <b>Nueva necesidad cerca de usted</b>\n${oferta.empresa}: ${resumenOferta}\nEntre a Tasa Directa para responder.`

  const chatIdsPorDestinatario = await chatIdsPorUsuarios(destinatarios.map((d) => d.id))

  await Promise.all(destinatarios.map((d) => {
    const chatIds = chatIdsPorDestinatario.get(d.id) ?? []
    return chatIds.length
      ? Promise.all(chatIds.map((chatId) => notificarTelegram(mensaje, chatId)))
      : enviarCorreo({
          to: d.correo,
          subject: 'Nueva necesidad cerca de usted — Tasa Directa',
          html: `<p><strong>${oferta.empresa}</strong>: ${resumenOferta}</p><p>Entre a Tasa Directa para responder.</p>`,
        })
  }))

  revalidatePath('/ofertas/mis-ofertas')
  return {
    error: null,
    mensaje: destinatarios.length > 0
      ? `Alerta enviada a ${destinatarios.length} profesional${destinatarios.length === 1 ? '' : 'es'} en su zona.`
      : 'Alerta procesada. No hay otros PCD activos en su zona por ahora.',
  }
}
