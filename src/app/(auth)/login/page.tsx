import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const errorInicial =
    error === 'confirmacion'
      ? 'El enlace de confirmación no es válido o expiró. Intente iniciar sesión o regístrese de nuevo.'
      : undefined

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Ingresar</CardTitle>
            <CardDescription>Acceso para PCD registrados.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <LoginForm errorInicial={errorInicial} />
            <p className="text-center text-sm text-muted-foreground">
              ¿Aún no está vinculado?{' '}
              <Link href="/registro" className="font-medium text-primary hover:underline">
                Registre su empresa
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
