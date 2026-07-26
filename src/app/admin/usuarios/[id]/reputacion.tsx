'use client'

import { useActionState, useState } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { eliminarCalificacion } from '../../actions'
import type { AdminState } from '../../actions'

export interface CalificacionRecibida {
  id: string
  estrellas: number
  comentario: string | null
  calificadorNombre: string
  createdAt: string
}

function BotonEliminarCalificacion({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(eliminarCalificacion, { error: null })
  return (
    <form
      action={formAction}
      onSubmit={(e) => { if (!window.confirm('¿Eliminar esta calificación? No se puede deshacer.')) e.preventDefault() }}
    >
      <input type="hidden" name="calificacionId" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Eliminando…' : 'Eliminar'}
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  )
}

export function Reputacion({
  promedio,
  total,
  calificaciones,
}: {
  promedio: number | null
  total: number
  calificaciones: CalificacionRecibida[]
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          Reputación
          {promedio !== null ? (
            <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
              <Star className="size-4 fill-amber-400 text-amber-400" /> {promedio.toFixed(1)} ({total})
            </span>
          ) : (
            <span className="text-sm font-normal text-muted-foreground">Sin calificaciones aún</span>
          )}
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          {calificaciones.length === 0 && (
            <p className="text-sm text-muted-foreground">Este usuario aún no ha recibido calificaciones.</p>
          )}
          {calificaciones.map((c) => (
            <div key={c.id} className="grid gap-1 rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-medium">
                  <Star className="size-4 fill-amber-400 text-amber-400" /> {c.estrellas}/5 · {c.calificadorNombre}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('es-CO')}
                  </span>
                  <BotonEliminarCalificacion id={c.id} />
                </div>
              </div>
              {c.comentario && <p className="text-muted-foreground">&ldquo;{c.comentario}&rdquo;</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
