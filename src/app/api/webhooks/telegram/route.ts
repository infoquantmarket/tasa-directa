import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notificarTelegram } from '@/lib/telegram/notificar'
import { parseTokenInicio } from '@/lib/telegram/vinculacion'

/**
 * Webhook de Telegram: recibe los updates del bot. Su único trabajo es
 * atender el `/start <token>` que dispara el deep-link de vinculación:
 * resuelve el token a una empresa y guarda el `chat_id` de quien escribió
 * (hasta 3 personas distintas por empresa — el trigger de la BD rechaza la
 * 4ª), para poder enviarle notificaciones después.
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

  let update: {
    message?: {
      text?: string
      chat?: { id?: number }
      from?: { first_name?: string; last_name?: string; username?: string }
    }
  }
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
  const { data: perfil, error: errorBusqueda } = await supabase
    .from('perfiles_usuarios')
    .select('id')
    .eq('telegram_link_token', token)
    .maybeSingle()

  if (errorBusqueda) {
    console.error('[webhook/telegram] error al buscar el token:', errorBusqueda)
    return NextResponse.json({ ok: true })
  }

  if (!perfil) {
    await notificarTelegram(
      'No encontramos una cuenta con ese enlace. Abra el enlace de vinculación desde su panel en Tasa Directa.',
      String(chatId)
    )
    return NextResponse.json({ ok: true })
  }

  const from = update.message?.from
  const nombreMostrar =
    [from?.first_name, from?.last_name].filter(Boolean).join(' ') ||
    (from?.username ? `@${from.username}` : 'Usuario de Telegram')

  const { error: errorVinculo } = await supabase
    .from('telegram_vinculaciones')
    .upsert(
      { usuario_id: perfil.id, chat_id: String(chatId), nombre_mostrar: nombreMostrar },
      { onConflict: 'usuario_id,chat_id' }
    )

  if (errorVinculo) {
    // El mensaje del trigger de tope (u otro error) ya viene listo para
    // mostrarse tal cual, mismo criterio que el resto del código.
    await notificarTelegram(errorVinculo.message, String(chatId))
    return NextResponse.json({ ok: true })
  }

  await notificarTelegram(
    '✅ <b>Telegram vinculado</b>\nA partir de ahora recibirá aquí los avisos de nuevas intenciones sobre sus ofertas en Tasa Directa.',
    String(chatId)
  )

  return NextResponse.json({ ok: true })
}
