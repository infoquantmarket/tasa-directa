import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notificarRecordatorioDidit } from '@/lib/notificaciones/recordatorio-didit'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: candidatos, error } = await supabase.rpc('usuarios_para_recordatorio_didit')

  if (error) {
    console.error('[cron/recordatorio-didit] error al leer candidatos:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let enviados = 0
  for (const candidato of candidatos ?? []) {
    await notificarRecordatorioDidit({
      correo: candidato.correo,
      razonSocial: candidato.razon_social,
    })

    const { error: errorRegistro } = await supabase.rpc('registrar_recordatorio_didit', {
      p_usuario_id: candidato.usuario_id,
    })
    if (errorRegistro) {
      console.error('[cron/recordatorio-didit] error al registrar envío:', errorRegistro)
      continue
    }
    enviados++
  }

  return NextResponse.json({ ok: true, candidatos: candidatos?.length ?? 0, enviados })
}
