import { NextRequest, NextResponse } from 'next/server'
import { verificarFirmaWebhook } from '@/lib/didit/firma'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  const cuerpoRaw = await request.text()
  const firmaV2 = request.headers.get('x-signature-v2')
  const timestampHeader = request.headers.get('x-timestamp')

  if (!firmaV2 || !timestampHeader) {
    return NextResponse.json({ ok: false, error: 'Faltan cabeceras de firma' }, { status: 401 })
  }

  const timestamp = Number(timestampHeader)
  const secreto = process.env.DIDIT_WEBHOOK_SECRET
  if (!secreto || Number.isNaN(timestamp)) {
    return NextResponse.json({ ok: false, error: 'Configuración inválida' }, { status: 401 })
  }

  const valido = verificarFirmaWebhook({ cuerpoRaw, firmaV2, timestamp, secreto })
  if (!valido) {
    return NextResponse.json({ ok: false, error: 'Firma inválida' }, { status: 401 })
  }

  let payload: { session_id?: string; status?: string; decision?: unknown }
  try {
    payload = JSON.parse(cuerpoRaw)
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const { session_id: sessionId, status: estado, decision } = payload
  if (!sessionId || !estado) {
    // Envelope inesperado (p. ej. un tipo de evento que no nos interesa).
    // Respondemos 200 para que Didit no reintente indefinidamente.
    return NextResponse.json({ ok: true })
  }

  const supabase = createServiceClient()
  await supabase
    .from('validaciones_identidad')
    .update({
      estado: estado as never,
      decision: (decision ?? null) as never,
    })
    .eq('session_id', sessionId)

  return NextResponse.json({ ok: true })
}
