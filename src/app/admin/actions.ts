'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { puedeAprobarUsuario } from '@/lib/validation/kyc'

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

  if (!puedeAprobarUsuario(docs ?? [])) {
    return { error: 'No se puede aprobar: los 3 documentos deben estar aprobados primero.' }
  }

  const { error } = await supabase
    .from('perfiles_usuarios')
    .update({ estado: 'aprobado', motivo_estado: null })
    .eq('id', usuarioId)

  if (error) return { error: 'No se pudo aprobar el usuario.' }

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
