'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { AccionState } from '../actions'

export function BotonAccionOferta({
  accion,
  campoNombre,
  campoValor,
  etiqueta,
  etiquetaCargando,
  variante = 'default',
}: {
  accion: (prev: AccionState, formData: FormData) => Promise<AccionState>
  campoNombre: string
  campoValor: string
  etiqueta: string
  etiquetaCargando: string
  variante?: 'default' | 'outline' | 'destructive' | 'ghost'
}) {
  const [state, formAction, pending] = useActionState<AccionState, FormData>(accion, { error: null })

  return (
    <form action={formAction} className="grid gap-1.5">
      <input type="hidden" name={campoNombre} value={campoValor} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant={variante} size="sm" disabled={pending}>
        {pending ? etiquetaCargando : etiqueta}
      </Button>
    </form>
  )
}
