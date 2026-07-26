'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { eliminarVinculacionTelegram, type AdminState } from '../../actions'

export interface VinculacionTelegramAdmin {
  id: string
  nombreMostrar: string
  createdAt: string
}

function BotonEliminarVinculacion({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(eliminarVinculacionTelegram, { error: null })
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

export function TelegramVinculado({ vinculaciones }: { vinculaciones: VinculacionTelegramAdmin[] }) {
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-white p-6">
      <h2 className="text-lg font-semibold">Telegram vinculado</h2>
      {vinculaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta empresa aún no ha vinculado ningún Telegram.</p>
      ) : (
        <div className="grid gap-2">
          {vinculaciones.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
              <span>{v.nombreMostrar} — vinculado el {new Date(v.createdAt).toLocaleDateString('es-CO')}</span>
              <BotonEliminarVinculacion id={v.id} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
