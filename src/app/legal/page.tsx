import Link from 'next/link'
import { DOCUMENTOS_LEGALES } from '@/lib/legal/documentos'

export default function LegalIndexPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Documentos legales</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tasa Directa — BitWave S.A.S. · NIT 901.920.120-1
      </p>
      <ul className="mt-8 grid gap-3">
        {DOCUMENTOS_LEGALES.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/legal/${d.slug}`}
              className="block rounded-lg border border-border p-4 hover:bg-muted/40"
            >
              <span className="font-medium">{d.titulo}</span>
              <span className="block text-sm text-muted-foreground">{d.subtitulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
