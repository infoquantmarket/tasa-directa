'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { desvincularTelegram, type AccionState } from './telegram-actions'

export function BotonDesvincularTelegram({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AccionState, FormData>(desvincularTelegram, { error: null })
  return (
    <form
      action={formAction}
      onSubmit={(e) => { if (!window.confirm('¿Desvincular este Telegram? Esa persona dejará de recibir avisos.')) e.preventDefault() }}
    >
      <input type="hidden" name="vinculacionId" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Desvinculando…' : 'Desvincular'}
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  )
}
