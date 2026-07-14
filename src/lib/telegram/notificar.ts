const TELEGRAM_API = 'https://api.telegram.org'

export async function notificarTelegram(mensaje: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados; se omite notificación.')
    return
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
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
