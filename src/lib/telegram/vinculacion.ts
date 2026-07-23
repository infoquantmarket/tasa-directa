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
