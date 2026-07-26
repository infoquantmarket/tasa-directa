import { createServiceClient } from '@/lib/supabase/service'

/** Username del bot de Tasa Directa; overridable por env, con fallback fijo. */
export const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'Tasa_Directa_bot'

/** Deep-link que el PCD abre para vincular su Telegram con su cuenta. */
export function deepLinkVinculacion(token: string): string {
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(token)}`
}

/**
 * Extrae el token de vinculación de un mensaje `/start <token>` de Telegram.
 * Devuelve null si el texto no es un `/start` con parámetro. Telegram limita
 * el parámetro a [A-Za-z0-9_-]{1,64}; un token inválido se ignora.
 */
export function parseTokenInicio(texto: string | undefined | null): string | null {
  if (!texto) return null
  const m = texto.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})$/)
  return m ? m[1] : null
}

/** Todos los chat_id vinculados de UNA empresa (puede haber hasta 3). */
export async function chatIdsDe(usuarioId: string): Promise<string[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('telegram_vinculaciones')
    .select('chat_id')
    .eq('usuario_id', usuarioId)
  return (data ?? []).map((d) => d.chat_id)
}

/**
 * Los chat_id vinculados de VARIAS empresas a la vez, agrupados por
 * usuario_id — una sola consulta, evita N+1 (usado por la alerta a mi ciudad,
 * que notifica a muchos candidatos de una vez).
 */
export async function chatIdsPorUsuarios(usuarioIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  if (!usuarioIds.length) return mapa

  const service = createServiceClient()
  const { data } = await service
    .from('telegram_vinculaciones')
    .select('usuario_id, chat_id')
    .in('usuario_id', usuarioIds)

  for (const fila of data ?? []) {
    const lista = mapa.get(fila.usuario_id) ?? []
    lista.push(fila.chat_id)
    mapa.set(fila.usuario_id, lista)
  }
  return mapa
}
