import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Toca la BD para evitar que Supabase free pause el proyecto por inactividad.
// No requiere auth — es solo un ping, sin datos sensibles.
export async function GET() {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('fecha_colombia')

  if (error) {
    console.error('[cron/keepalive]', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
