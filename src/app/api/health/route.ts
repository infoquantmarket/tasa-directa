import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()

    // Prueba 1: conexión básica — contar tablas del esquema público
    const { data: tablas, error: errorTablas } = await supabase
      .rpc('fecha_colombia')

    if (errorTablas) throw new Error(`Supabase RPC: ${errorTablas.message}`)

    // Prueba 2: leer la tabla de ofertas (debe devolver 0 rows, no error)
    const { error: errorOfertas } = await supabase
      .from('ofertas')
      .select('id')
      .limit(1)

    if (errorOfertas) throw new Error(`Tabla ofertas: ${errorOfertas.message}`)

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      fecha_colombia: tablas,
      supabase: 'conectado',
      tablas_accesibles: ['ofertas', 'perfiles_usuarios', 'membresias', 'documentos_kyc', 'intenciones'],
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
