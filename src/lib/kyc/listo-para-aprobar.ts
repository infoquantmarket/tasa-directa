import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { puedeAprobarUsuario } from '@/lib/validation/kyc'
import { notificarTelegram } from '@/lib/telegram/notificar'

/**
 * Se llama desde los dos puntos donde una cuenta puede quedar lista para
 * aprobación (documentos + identidad completos): el webhook de Didit y la
 * aprobación del último documento — cualquiera de los dos puede ser el que
 * falte de último. Si con este cambio ya queda lista, alerta al admin por
 * Telegram (mismo canal fijo que "PCD aprobado" en aprobarUsuario()).
 */
export async function alertarSiListoParaAprobar(
  supabase: SupabaseClient<Database>,
  usuarioId: string
): Promise<void> {
  const [{ data: docs }, { data: verificacion }] = await Promise.all([
    supabase.from('documentos_kyc').select('tipo_documento, estado').eq('usuario_id', usuarioId),
    supabase
      .from('validaciones_identidad')
      .select('estado')
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!puedeAprobarUsuario(docs ?? [], verificacion)) return

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('razon_social, nit, correo')
    .eq('id', usuarioId)
    .single()

  await notificarTelegram(
    `🪪 <b>Listo para aprobar</b>\n${perfil?.razon_social ?? usuarioId}\nNIT: ${perfil?.nit ?? '—'}\nCorreo: ${perfil?.correo ?? '—'}\n➡️ Documentos e identidad completos — puede aprobar la cuenta.`
  )
}
