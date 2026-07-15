'use client'

import { useActionState, useState } from 'react'
import { aceptarTerminos, type ContratoState } from './actions'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { documentosPorEtapa } from '@/lib/legal/documentos'

const DOCS = documentosPorEtapa('contrato') // 6 documentos

export function ContratoForm() {
  const [state, formAction, pending] = useActionState<ContratoState, FormData>(
    aceptarTerminos,
    { error: null }
  )
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const todos = DOCS.every((d) => marcados[d.slug])

  return (
    <form action={formAction} className="grid gap-8">
      {DOCS.map((doc) => (
        <div key={doc.slug} className="grid gap-2">
          <h3 className="font-semibold">{doc.titulo}</h3>
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {doc.texto}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={doc.slug}
              checked={Boolean(marcados[doc.slug])}
              onChange={(e) =>
                setMarcados((m) => ({ ...m, [doc.slug]: e.target.checked }))
              }
              className="mt-0.5"
            />
            {doc.etiquetaCasilla}
          </label>
        </div>
      ))}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending || !todos} size="lg" className="w-fit">
        {pending ? 'Guardando…' : 'Aceptar y continuar'}
      </Button>
    </form>
  )
}
