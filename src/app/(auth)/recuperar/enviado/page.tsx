import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MailCheck } from 'lucide-react'

export const metadata: Metadata = { title: 'Revise su correo' }

export default function RecuperarEnviadoPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-24">
        <Card className="text-center">
          <CardHeader className="items-center">
            <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <MailCheck className="h-6 w-6 text-primary" />
            </span>
            <CardTitle>Revise su correo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Si el correo está registrado, le enviamos un enlace para poner una
            contraseña nueva. El enlace expira después de un tiempo por
            seguridad.
          </CardContent>
        </Card>
      </main>
    </>
  )
}
