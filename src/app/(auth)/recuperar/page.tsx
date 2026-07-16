import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RecuperarForm } from './recuperar-form'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function RecuperarPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Recuperar contraseña</CardTitle>
            <CardDescription>
              Ingrese el correo de su cuenta y le enviaremos un enlace para
              poner una contraseña nueva.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RecuperarForm />
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Volver a iniciar sesión
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
