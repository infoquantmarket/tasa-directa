import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { LandingHero } from './landing-hero'

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <LandingHero />

        <footer className="mt-auto border-t border-border py-8 text-center text-sm text-muted-foreground">
          <p>Tasa Directa conecta profesionales; no ejecuta ni intermedia transacciones cambiarias.</p>
          <p className="mt-1 text-xs">Tasa Directa es una empresa de BitWave S.A.S. · NIT 901.920.120-1</p>
          <p className="mt-3 text-xs">
            <Link href="/legal" className="text-primary hover:underline">
              Documentos legales
            </Link>
          </p>
        </footer>
      </main>
    </>
  )
}
