import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { cerrarSesion } from '@/app/(auth)/actions'

export async function SiteHeader() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let esAdmin = false
  if (user) {
    const { data: perfil } = await supabase
      .from('perfiles_usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()
    esAdmin = perfil?.rol === 'admin'
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            T
          </span>
          <span className="text-lg font-semibold tracking-tight">Tasa Directa</span>
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Button variant="ghost" render={<Link href="/dashboard" />}>
                Mi cuenta
              </Button>
              {esAdmin && (
                <Button variant="ghost" render={<Link href="/admin" />}>
                  Cumplimiento
                </Button>
              )}
              <form action={cerrarSesion}>
                <Button variant="outline" type="submit">Salir</Button>
              </form>
            </>
          ) : (
            <>
              <Button variant="ghost" render={<Link href="/login" />}>
                Ingresar
              </Button>
              <Button render={<Link href="/registro" />}>
                Registrarse
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
