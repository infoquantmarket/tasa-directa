import type { Metadata } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RegistroForm } from './registro-form'

export const metadata: Metadata = { title: 'Registro de PCD' }

const DOCUMENTOS_REQUERIDOS = [
  'RUT (Registro Único Tributario) vigente',
  'Cámara de Comercio: certificado de existencia y representación legal',
  'Resolución DIAN: autorización como Profesional de Compra y Venta de Divisas',
]

export default function RegistroPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Vincule su empresa</CardTitle>
            <CardDescription>
              Tasa Directa es el marketplace B2B del sector cambiario en Colombia: conectamos
              Profesionales de Compra y Venta de Divisas (PCD) autorizados por la DIAN para que
              publiquen sus necesidades y negocien directamente entre ellos. La plataforma no
              ejecuta ni intermedia transacciones cambiarias.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-border bg-accent/40 p-4">
              <p className="mb-3 text-sm font-medium">
                Después de registrarse, deberá cargar estos documentos para la verificación:
              </p>
              <ul className="space-y-2">
                {DOCUMENTOS_REQUERIDOS.map((doc) => (
                  <li key={doc} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>
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
