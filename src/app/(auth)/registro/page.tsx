import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RegistroForm } from './registro-form'

export const metadata: Metadata = { title: 'Registro de PCD' }

export default function RegistroPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Vincule su empresa</CardTitle>
            <CardDescription>
              Registro exclusivo para Profesionales de Compra y Venta de Divisas (PCD)
              autorizados por la DIAN.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistroForm />
          </CardContent>
        </Card>
      </main>
    </>
  )
}
