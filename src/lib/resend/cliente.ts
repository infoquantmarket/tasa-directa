const RESEND_URL = 'https://api.resend.com/emails'
const REMITENTE = 'Tasa Directa <noreply@tasadirecta.com>'

export interface EnviarCorreoInput {
  to: string
  subject: string
  html: string
}

/**
 * Envía un correo transaccional vía la API de Resend. Es "best-effort" a
 * propósito (nunca lanza): un fallo al notificar por correo no debe romper
 * el flujo del usuario (ej. crear una intención), igual que
 * src/lib/telegram/notificar.ts.
 */
export async function enviarCorreo(input: EnviarCorreoInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY no configurado; se omite envío.')
    return
  }

  try {
    const respuesta = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    })
    if (!respuesta.ok) {
      console.error('[resend] Error al enviar correo:', await respuesta.text())
    }
  } catch (err) {
    console.error('[resend] Excepción al enviar correo:', err)
  }
}
