'use client'

import { useActionState, useState } from 'react'
import { realizarOferta, type AccionState } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'

export function ModalRealizarOferta({ ofertaId }: { ofertaId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<AccionState, FormData>(
    async (prev, formData) => {
      const resultado = await realizarOferta(prev, formData)
      if (!resultado.error) setOpen(false)
      return resultado
    },
    { error: null }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Realizar Oferta</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Realizar Oferta</DialogTitle>
          <DialogDescription>
            Al enviar esta respuesta, se le compartirán sus datos de contacto
            al dueño de la publicación para que negocien directamente.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="ofertaId" value={ofertaId} />
          <div>
            <Label htmlFor="tipo" className="mb-1.5 block">Tipo de respuesta</Label>
            <select
              id="tipo"
              name="tipo"
              required
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="aceptar_precio">Acepto el precio publicado</option>
              <option value="solicitar_contacto">Quiero negociar / solicitar contacto</option>
            </select>
          </div>
          <div>
            <Label htmlFor="comentarios" className="mb-1.5 block">Comentarios (opcional)</Label>
            <Textarea id="comentarios" name="comentarios" rows={3} />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
