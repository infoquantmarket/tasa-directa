'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ofertaSchema } from '@/lib/validation/oferta'
import { intencionSchema } from '@/lib/validation/intencion'
import { notificarNuevaIntencion } from '@/lib/notificaciones/intencion'
import { notificarTelegram } from '@/lib/telegram/notificar'

export type AccionState = { error: string | null }

/**
 * Traduce los `raise exception` de Postgres (triggers/funciones) a mensajes
 * que tienen sentido para el PCD. Los triggers ya escriben mensajes en
 * español pensados para mostrarse tal cual; solo se agrega contexto cuando
 * el mensaje de Postgres no alcanza a explicar el porqué.
 */
function mensajeDesdeError(error: { message: string } | null): string {
  if (!error) return 'Ocurrió un error inesperado. Intente de nuevo.'
  if (error.message.includes('Saldo insuficiente')) {
    return 'Ya tiene 2 ofertas activas gratis. Publicar una adicional requiere tokens y no tiene saldo suficiente.'
  }
  return error.message
}

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
    .select('razon_social')
    .eq('id', user.id)
    .single()

  const d = parsed.data
  const { error } = await supabase.from('ofertas').insert({
    usuario_id: user.id,
    empresa: perfil?.razon_social ?? '',
    sede: d.sede || null,
    operacion: d.operacion,
    moneda: d.moneda,
    cantidad: Number(d.cantidad),
    precio_cop: Number(d.precioCop),
    condiciones: d.condiciones,
    estado: 'activa',
    notas: d.notas || null,
  })

  if (error) return { error: mensajeDesdeError(error) }

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
    .in('estado', ['enviada', 'vista'])

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

    // Aviso directo al PCD dueño de la oferta si vinculó su Telegram. El
    // chat_id no es legible por el usuario que responde (RLS), así que se lee
    // con el cliente de servicio.
    const service = createServiceClient()
    const { data: duenoTg } = await service
      .from('perfiles_usuarios')
      .select('telegram_chat_id')
      .eq('id', oferta.usuario_id)
      .single()
    if (duenoTg?.telegram_chat_id && quienResponde) {
      await notificarTelegram(
        `🤝 <b>Nueva intención sobre su oferta</b>\nSu oferta: ${resumenOferta}\n${quienResponde.razon_social} — ${quienResponde.contacto_nombre} · ${quienResponde.contacto_celular} · ${quienResponde.contacto_correo}\n\nEntre a Tasa Directa para ver el detalle.`,
        duenoTg.telegram_chat_id
      )
    }
  }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}

export async function marcarIntencionVista(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const intencionId = String(formData.get('intencionId') ?? '')
  if (!intencionId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('intenciones')
    .update({ estado: 'vista' })
    .eq('id', intencionId)
    .eq('estado', 'enviada')
    .select('id')
    .single()

  if (error) return { error: 'No se pudo actualizar.' }

  revalidatePath('/ofertas/mis-ofertas')
  return { error: null }
}
