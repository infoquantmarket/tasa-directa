import { notFound } from 'next/navigation'
import Link from 'next/link'
import { documentoPorSlug, DOCUMENTOS_LEGALES } from '@/lib/legal/documentos'

export function generateStaticParams() {
  return DOCUMENTOS_LEGALES.map((d) => ({ slug: d.slug }))
}

export default async function DocumentoLegalPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = documentoPorSlug(slug)
  if (!doc) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/legal" className="text-sm text-primary hover:underline">
        ← Documentos legales
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{doc.titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {doc.subtitulo} · Versión {doc.version}
      </p>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {doc.texto}
      </article>
    </main>
  )
}
