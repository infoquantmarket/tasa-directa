import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SiteHeader } from '@/components/site-header'
import { ShieldCheck, FileCheck2, Handshake } from 'lucide-react'

const PILARES = [
  {
    icono: ShieldCheck,
    titulo: 'Solo PCD verificados',
    texto: 'Cada Profesional de Compra y Venta de Divisas pasa por verificación documental: RUT, Cámara de Comercio y Resolución DIAN.',
  },
  {
    icono: FileCheck2,
    titulo: 'Cumplimiento primero',
    texto: 'Un equipo de cumplimiento revisa y aprueba cada vinculación antes de habilitar el acceso al mercado.',
  },
  {
    icono: Handshake,
    titulo: 'Conexión directa',
    texto: 'Tasa Directa conecta la oferta y la demanda entre profesionales. Las operaciones se cierran directamente entre las partes.',
  },
]

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-24 text-center">
          <p className="mb-4 rounded-full border border-border bg-accent px-4 py-1 text-sm font-medium text-accent-foreground">
            Seguridad y Confianza
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            El marketplace B2B del sector cambiario en Colombia
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Plataforma exclusiva para Profesionales de Compra y Venta de Divisas (PCD)
            autorizados por la DIAN. Publique sus necesidades, encuentre contraparte
            y negocie de forma directa.
          </p>
          <div className="mt-10 flex gap-4">
            <Button size="lg" render={<Link href="/registro" />}>
              Vincular mi empresa
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/login" />}>
              Ya tengo cuenta
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-white">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-16 sm:grid-cols-3">
            {PILARES.map(({ icono: Icono, titulo, texto }) => (
              <div key={titulo} className="flex flex-col gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                  <Icono className="h-5 w-5 text-primary" />
                </span>
                <h2 className="font-semibold">{titulo}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-auto border-t border-border py-8 text-center text-sm text-muted-foreground">
          Tasa Directa conecta profesionales; no ejecuta ni intermedia transacciones cambiarias.
        </footer>
      </main>
    </>
  )
}
