import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notificarTelegram } from '@/lib/telegram/notificar'
import { parseTokenInicio } from '@/lib/telegram/vinculacion'

/**
 * Webhook de Telegram: recibe los updates del bot. Su único trabajo es
 * atender el `/start <token>` que dispara el deep-link de vinculación:
 * resuelve el token a un perfil y guarda el `chat_id` de quien escribió, para
 * poder enviarle notificaciones después.
 *
 * Registrar una vez (reemplazar <TOKEN> y <SECRET>):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d url="https://www.tasadirecta.com/api/webhooks/telegram" \
 *     -d secret_token="<SECRET>"
 */
export async function POST(request: NextRequest) {
  // Verificación opcional: si hay secreto configurado, exige que Telegram lo
  // reenvíe en la cabecera (se fija con `secret_token` en setWebhook).
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secreto) {
    const recibido = request.headers.get('x-telegram-bot-api-secret-token')
    if (recibido !== secreto) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  let update: { message?: { text?: string; chat?: { id?: number } } }
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const texto = update.message?.text
  const chatId = update.message?.chat?.id
  const token = parseTokenInicio(texto)

  // Cualquier update que no sea un `/start <token>` válido se ignora (200 para
  // que Telegram no reintente).
  if (!token || chatId == null) {
    return NextResponse.json({ ok: true })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('perfiles_usuarios')
    .update({ telegram_chat_id: String(chatId) })
    .eq('telegram_link_token', token)
    .select('razon_social')
    .maybeSingle()

  if (error) {
    console.error('[webhook/telegram] error al vincular chat_id:', error)
    return NextResponse.json({ ok: true })
  }

  if (data) {
    await notificarTelegram(
      `✅ <b>Telegram vinculado</b>\nA partir de ahora recibirá aquí los avisos de nuevas intenciones sobre sus ofertas en Tasa Directa.`,
      String(chatId)
    )
  } else {
    await notificarTelegram(
      'No encontramos una cuenta con ese enlace. Abra el enlace de vinculación desde su panel en Tasa Directa.',
      String(chatId)
    )
  }

  return NextResponse.json({ ok: true })
}
