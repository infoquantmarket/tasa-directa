'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TIPOS_DOCUMENTO, TODOS_TIPOS_DOCUMENTO } from '@/lib/validation/kyc'
import { notificarTelegram } from '@/lib/telegram/notificar'
import type { TipoDoc } from '@/types/database'

export type DocState = { error: string | null; ok?: boolean }

export async function registrarDocumento(
  tipo: TipoDoc,
  storagePath: string,
  nombreArchivo: string
): Promise<DocState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  if (!TODOS_TIPOS_DOCUMENTO.includes(tipo)) return { error: 'Tipo de documento inválido.' }

  // El path DEBE estar dentro de la carpeta del usuario (defensa además del RLS de Storage)
  if (!storagePath.startsWith(`${user.id}/`)) {
    return { error: 'Ruta de archivo inválida.' }
  }

  // Se consulta el estado ANTES del upsert para saber si el set de 3 documentos
  // ya estaba completo (y así no repetir la notificación en recargas/reemplazos).
  const { data: docsAntes } = await supabase
    .from('documentos_kyc')
    .select('tipo_documento')
    .eq('usuario_id', user.id)

  const tiposAntes = (docsAntes ?? []).map((d) => d.tipo_documento)
  const estabaCompleto = TIPOS_DOCUMENTO.every((t) => tiposAntes.includes(t))

  // Upsert: si el documento existía (p. ej. rechazado), la fila vuelve a 'pendiente'.
  // El RLS (migration 0002) impide editar documentos ya aprobados.
  const { error } = await supabase
    .from('documentos_kyc')
    .upsert(
      {
        usuario_id: user.id,
        tipo_documento: tipo,
        storage_path: storagePath,
        nombre_archivo: nombreArchivo,
        estado: 'pendiente',
        notas_revision: null,
        revisado_por: null,
        revisado_at: null,
      },
      { onConflict: 'usuario_id,tipo_documento' }
    )

  if (error) {
    return { error: 'No se pudo registrar el documento. Intente de nuevo.' }
  }

  if (!estabaCompleto) {
    const tiposAhora = new Set([...tiposAntes, tipo])
    const completoAhora = TIPOS_DOCUMENTO.every((t) => tiposAhora.has(t))
    if (completoAhora) {
      await notificarTelegram(
        `📄 <b>Documentos completos para revisión</b>\nUsuario ID: ${user.id}\nLos 3 documentos KYC ya fueron cargados.`
      )
    }
  }

  revalidatePath('/dashboard')
  return { error: null, ok: true }
}
