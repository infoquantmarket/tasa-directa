'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { puedeAprobarUsuario } from '@/lib/validation/kyc'
import { notificarTelegram } from '@/lib/telegram/notificar'

export type AdminState = { error: string | null }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, admin: null }
  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()
  return { supabase, admin: perfil?.rol === 'admin' ? user : null }
}

export async function revisarDocumento(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const docId = String(formData.get('docId') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const nota = String(formData.get('nota') ?? '').trim()

  if (!docId || !['aprobado', 'rechazado'].includes(decision)) {
    return { error: 'Solicitud inválida.' }
  }
  if (decision === 'rechazado' && nota.length < 5) {
    return { error: 'Indique el motivo del rechazo (mínimo 5 caracteres) para que el PCD sepa qué corregir.' }
  }

  const { error } = await supabase
    .from('documentos_kyc')
    .update({
      estado: decision as 'aprobado' | 'rechazado',
      notas_revision: nota || null,
      revisado_por: admin.id,
      revisado_at: new Date().toISOString(),
    })
    .eq('id', docId)

  if (error) return { error: 'No se pudo guardar la revisión.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function aprobarUsuario(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!usuarioId) return { error: 'Solicitud inválida.' }

  const { data: docs } = await supabase
    .from('documentos_kyc')
    .select('tipo_documento, estado')
    .eq('usuario_id', usuarioId)

  const { data: verificacion } = await supabase
    .from('validaciones_identidad')
    .select('estado')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!puedeAprobarUsuario(docs ?? [], verificacion)) {
    return {
      error: 'No se puede aprobar: los 3 documentos y la verificación de identidad del representante legal deben estar aprobados primero.',
    }
  }

  const { error } = await supabase
    .from('perfiles_usuarios')
    .update({ estado: 'aprobado', motivo_estado: null })
    .eq('id', usuarioId)

  if (error) return { error: 'No se pudo aprobar el usuario.' }

  const { data: perfilAprobado } = await supabase
    .from('perfiles_usuarios')
    .select('razon_social, nit, correo')
    .eq('id', usuarioId)
    .single()

  await notificarTelegram(
    `✅ <b>PCD aprobado</b>\n${perfilAprobado?.razon_social ?? usuarioId}\nNIT: ${perfilAprobado?.nit ?? '—'}\nCorreo: ${perfilAprobado?.correo ?? '—'}\n➡️ Enviar enlace de pago Bold para activar la membresía.`
  )

  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function rechazarUsuario(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  const motivo = String(formData.get('motivo') ?? '').trim()
  if (!usuarioId) return { error: 'Solicitud inválida.' }
  if (motivo.length < 5) {
    return { error: 'Indique el motivo del rechazo (mínimo 5 caracteres).' }
  }

  const { error } = await supabase
    .from('perfiles_usuarios')
    .update({ estado: 'rechazado', motivo_estado: motivo })
    .eq('id', usuarioId)

  if (error) return { error: 'No se pudo rechazar el usuario.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function activarMembresia(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!usuarioId) return { error: 'Solicitud inválida.' }

  // El índice único uniq_membresia_activa garantiza una sola activa por usuario.
  const { error } = await supabase.from('membresias').insert({
    usuario_id: usuarioId,
    tipo: 'estandar',
    estado: 'activa',
    fecha_inicio: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
    fecha_fin: null,
  })

  if (error) {
    return { error: 'No se pudo activar (¿ya tiene una membresía activa?).' }
  }
  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function cancelarMembresia(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!usuarioId) return { error: 'Solicitud inválida.' }

  const { error } = await supabase
    .from('membresias')
    .update({ estado: 'cancelada' })
    .eq('usuario_id', usuarioId)
    .eq('estado', 'activa')

  if (error) return { error: 'No se pudo cancelar la membresía.' }
  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function otorgarTokens(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  const cantidad = Number(formData.get('cantidad'))
  const nota = String(formData.get('nota') ?? '').trim()

  if (!usuarioId || !Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 100000) {
    return { error: 'Cantidad inválida: debe ser un entero entre 1 y 100.000.' }
  }

  const { error } = await supabase.rpc('otorgar_tokens', {
    p_usuario: usuarioId,
    p_cantidad: cantidad,
    p_nota: nota || undefined,
  })

  if (error) return { error: 'No se pudieron otorgar los tokens.' }
  revalidatePath('/admin', 'layout')
  return { error: null }
}
