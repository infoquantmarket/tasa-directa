'use client'

import { useActionState, useState } from 'react'
import { Star } from 'lucide-react'
import { calificarContraparte } from './calificaciones-actions'
import type { AccionState } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function ModalCalificar({
  ofertaId,
  contraparte,
  resumen,
}: {
  ofertaId: string
  contraparte: string
  resumen: string
}) {
  const [open, setOpen] = useState(false)
  const [estrellas, setEstrellas] = useState(0)
  const [state, formAction, pending] = useActionState<AccionState, FormData>(
    async (prev, formData) => {
      const resultado = await calificarContraparte(prev, formData)
      if (!resultado.error) setOpen(false)
      return resultado
    },
    { error: null }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Calificar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calificar a {contraparte}</DialogTitle>
          <DialogDescription>{resumen}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="ofertaId" value={ofertaId} />
          <input type="hidden" name="estrellas" value={estrellas} />
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEstrellas(n)}
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                className="p-0.5"
              >
                <Star className={cn('size-7', n <= estrellas ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
              </button>
            ))}
          </div>
          <Textarea
            name="comentario"
            placeholder="Comentario opcional (solo lo ve el equipo de Tasa Directa, no la contraparte)"
            rows={3}
          />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending || estrellas === 0}>
            {pending ? 'Enviando…' : 'Enviar calificación'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
