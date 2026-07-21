import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Cliente con `service_role`: sortea RLS por completo. Úsese SOLO en rutas
 * de servidor sin sesión de usuario (webhooks de proveedores externos como
 * Didit o Bold) — nunca para responder a una request de un cliente
 * autenticado normal, donde corresponde `src/lib/supabase/server.ts`.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
