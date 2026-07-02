-- =============================================================================
-- TASA DIRECTA · Parte 2 de 2 · Cron de expiración de ofertas
--
-- REQUISITO: activar pg_cron en Database → Extensions antes de correr esto.
-- Si no tienes pg_cron disponible en tu plan, usa el Vercel Cron alternativo
-- descrito al final de este archivo.
-- =============================================================================

-- Elimina el job si ya existía (para re-ejecución segura)
select cron.unschedule('expirar-ofertas-medianoche')
where exists (
  select 1 from cron.job where jobname = 'expirar-ofertas-medianoche'
);

-- 00:00 America/Bogota = 05:00 UTC (Colombia no usa horario de verano)
select cron.schedule(
  'expirar-ofertas-medianoche',
  '0 5 * * *',
  $$
    update public.ofertas
       set estado = 'expirada', updated_at = now()
     where estado = 'activa';
  $$
);

-- =============================================================================
-- ALTERNATIVA: Vercel Cron (si no usas pg_cron)
-- =============================================================================
-- 1. En vercel.json (o vercel.ts) agrega:
--    { "crons": [{ "path": "/api/cron/expirar-ofertas", "schedule": "0 5 * * *" }] }
--
-- 2. Crea el archivo src/app/api/cron/expirar-ofertas/route.ts con:
--
--    import { createClient } from '@supabase/supabase-js'
--    import { NextResponse } from 'next/server'
--
--    export async function GET(request: Request) {
--      const authHeader = request.headers.get('authorization')
--      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
--        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
--      }
--      const supabase = createClient(
--        process.env.NEXT_PUBLIC_SUPABASE_URL!,
--        process.env.SUPABASE_SERVICE_ROLE_KEY!
--      )
--      const { error } = await supabase
--        .from('ofertas')
--        .update({ estado: 'expirada' })
--        .eq('estado', 'activa')
--      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
--      return NextResponse.json({ ok: true })
--    }
-- =============================================================================
