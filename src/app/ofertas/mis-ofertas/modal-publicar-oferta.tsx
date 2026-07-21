'use client'

import { useActionState, useState } from 'react'
import { publicarOferta, type AccionState } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { MONEDAS, CONDICIONES } from '@/lib/validation/oferta'

const ETIQUETA_CONDICION: Record<(typeof CONDICIONES)[number], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  para_recoger: 'Para recoger',
  en_oficina: 'En oficina',
}

export function ModalPublicarOferta({ deshabilitado, motivo }: { deshabilitado: boolean; motivo: string | null }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<AccionState, FormData>(
    async (prev, formData) => {
      const resultado = await publicarOferta(prev, formData)
      if (!resultado.error) setOpen(false)
      return resultado
    },
    { error: null }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={deshabilitado} />}>Publicar oferta</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publicar oferta</DialogTitle>
          <DialogDescription>
            Esta oferta expira automáticamente 24 horas después de publicarla.
            Si sigue vigente y quiere mantenerla, deberá publicarla de nuevo.
            De la 3ra oferta activa en adelante se consume 1 token.
          </DialogDescription>
        </DialogHeader>
        {deshabilitado && motivo && (
          <Alert variant="destructive">
            <AlertDescription>{motivo}</AlertDescription>
          </Alert>
        )}
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="operacion" className="mb-1.5 block">Operación</Label>
              <select id="operacion" name="operacion" required className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                <option value="compra">Compra</option>
                <option value="venta">Venta</option>
              </select>
            </div>
            <div>
              <Label htmlFor="moneda" className="mb-1.5 block">Moneda</Label>
              <select id="moneda" name="moneda" required className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cantidad" className="mb-1.5 block">Cantidad</Label>
              <Input id="cantidad" name="cantidad" type="text" inputMode="decimal" required />
            </div>
            <div>
              <Label htmlFor="precioCop" className="mb-1.5 block">Precio (COP)</Label>
              <Input id="precioCop" name="precioCop" type="text" inputMode="decimal" required />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Condiciones</Label>
            <div className="flex flex-wrap gap-3">
              {CONDICIONES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="condiciones" value={c} />
                  {ETIQUETA_CONDICION[c]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="sede" className="mb-1.5 block">Sede (opcional)</Label>
            <Input id="sede" name="sede" type="text" placeholder="Oviedo" />
          </div>
          <div>
            <Label htmlFor="notas" className="mb-1.5 block">Notas (opcional)</Label>
            <Textarea id="notas" name="notas" rows={2} placeholder="Ej.: están en billetes de 20" />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Publicando…' : 'Publicar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
