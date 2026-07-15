import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RegistroForm } from './registro-form'

export const metadata: Metadata = { title: 'Crear cuenta' }

export default function RegistroPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Cree su cuenta</CardTitle>
            <CardDescription>
              Tasa Directa es el marketplace B2B del sector cambiario en Colombia, exclusivo
              para Profesionales de Compra y Venta de Divisas (PCD) autorizados por la DIAN.
              La plataforma no ejecuta ni intermedia transacciones cambiarias.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RegistroForm />
            <p className="text-center text-xs text-muted-foreground">
              Tasa Directa es una empresa de BitWave S.A.S. · NIT 901.920.120-1
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
