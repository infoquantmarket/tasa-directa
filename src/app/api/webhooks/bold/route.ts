import { NextResponse } from 'next/server'

// Contrato estable — ver docs/arquitectura-pagos-bold.md
// Se activará al configurar la cuenta Bold (BOLD_WEBHOOK_SECRET + service_role).
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Webhook de Bold aún no configurado' },
    { status: 501 }
  )
}
