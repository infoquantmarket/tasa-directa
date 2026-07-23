const TELEGRAM_API = 'https://api.telegram.org'

/**
 * Envía un mensaje por Telegram. Sin `chatId` va al chat del admin
 * (TELEGRAM_CHAT_ID); con `chatId` va a ese chat específico (ej. el Telegram
 * que un PCD vinculó). Best-effort: nunca lanza — un fallo de notificación no
 * debe romper el flujo del usuario.
 */
export async function notificarTelegram(mensaje: string, chatId?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const destino = chatId ?? process.env.TELEGRAM_CHAT_ID

  if (!token || !destino) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN o chat destino no configurados; se omite notificación.')
    return
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: destino,
        text: mensaje,
        parse_mode: 'HTML',
      }),
    })
    if (!res.ok) {
      console.error('[telegram] Error al enviar notificación:', await res.text())
    }
  } catch (err) {
    // Nunca debe romper el flujo del usuario por un fallo de notificación.
    console.error('[telegram] Excepción al enviar notificación:', err)
  }
}
