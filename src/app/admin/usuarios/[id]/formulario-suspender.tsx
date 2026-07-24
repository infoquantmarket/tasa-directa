'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { suspenderUsuario, type AdminState } from '../../actions'

export function FormularioSuspender({ usuarioId }: { usuarioId: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(
    suspenderUsuario,
    { error: null }
  )

  return (
    <form
      action={formAction}
      className="grid gap-3"
      onSubmit={(e) => {
        const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '').trim()
        if (motivo.length < 5) {
          e.preventDefault()
          window.alert('Indique el motivo de la suspensión (mínimo 5 caracteres).')
          return
        }
        if (!window.confirm('¿Suspender este PCD? Se cancelará su membresía y sus ofertas activas serán eliminadas. Podrá reactivarlo después.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <Textarea
        name="motivo"
        placeholder="Motivo de la suspensión (visible para el PCD)"
        rows={2}
        required
      />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="destructive" size="sm" className="w-fit" disabled={pending}>
        {pending ? 'Suspendiendo…' : 'Suspender PCD'}
      </Button>
    </form>
  )
}
