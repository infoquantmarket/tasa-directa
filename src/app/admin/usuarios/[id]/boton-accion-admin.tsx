'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { AdminState } from '../../actions'

/**
 * Botón para acciones del admin que pueden requerir confirmación
 * (suspender, cancelar, reactivar). Mismo patrón que BotonAccionOferta.
 */
export function BotonAccionAdmin({
  accion,
  campos,
  etiqueta,
  etiquetaCargando,
  variante = 'default',
  confirmar,
  className,
}: {
  accion: (prev: AdminState, formData: FormData) => Promise<AdminState>
  campos: Record<string, string>
  etiqueta: string
  etiquetaCargando: string
  variante?: 'default' | 'outline' | 'destructive' | 'ghost'
  confirmar?: string
  className?: string
}) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(accion, { error: null })

  return (
    <form
      action={formAction}
      className={`grid gap-1.5 ${className ?? ''}`}
      onSubmit={confirmar ? (e) => { if (!window.confirm(confirmar)) e.preventDefault() } : undefined}
    >
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant={variante} size="sm" disabled={pending} className="w-fit">
        {pending ? etiquetaCargando : etiqueta}
      </Button>
    </form>
  )
}
