import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Contrato estable — ver docs/arquitectura-validacion-identidad.md
// Se activará al contratar el proveedor de verificación de identidad.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol !== 'admin') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 })
  }

  return NextResponse.json(
    { ok: false, error: 'Proveedor de validación externa aún no configurado' },
    { status: 501 }
  )
}
