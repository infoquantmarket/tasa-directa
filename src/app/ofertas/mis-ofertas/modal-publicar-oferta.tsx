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
import { MONEDAS, CONDICIONES, ofertaSchema, type OfertaInput } from '@/lib/validation/oferta'
import { TarjetaOferta } from '../tarjeta-oferta'

const ETIQUETA_CONDICION: Record<(typeof CONDICIONES)[number], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  para_recoger: 'Para recoger',
  en_oficina: 'En oficina',
}

const VACIO: OfertaInput = {
  operacion: 'venta',
  moneda: 'USD',
  cantidad: '',
  precioCop: '',
  condiciones: [],
  sede: '',
  notas: '',
}

export function ModalPublicarOferta({
  deshabilitado,
  motivo,
  empresa,
}: {
  deshabilitado: boolean
  motivo: string | null
  empresa: string
}) {
  const [open, setOpen] = useState(false)
  const [paso, setPaso] = useState<'formulario' | 'revision'>('formulario')
  const [form, setForm] = useState<OfertaInput>(VACIO)
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null)
  const [expiraPreview, setExpiraPreview] = useState('')

  const [state, formAction, pending] = useActionState<AccionState, FormData>(
    async (prev, formData) => {
      const resultado = await publicarOferta(prev, formData)
      if (!resultado.error) {
        setOpen(false)
        setPaso('formulario')
        setForm(VACIO)
      }
      return resultado
    },
    { error: null }
  )

  const actualizar = <K extends keyof OfertaInput>(campo: K, valor: OfertaInput[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  const alternarCondicion = (c: (typeof CONDICIONES)[number]) =>
    setForm((f) => ({
      ...f,
      condiciones: f.condiciones.includes(c) ? f.condiciones.filter((x) => x !== c) : [...f.condiciones, c],
    }))

  const revisar = () => {
    const parsed = ofertaSchema.safeParse(form)
    if (!parsed.success) {
      setErrorValidacion(parsed.error.issues[0].message)
      return
    }
    setErrorValidacion(null)
    setExpiraPreview(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
    setPaso('revision')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setPaso('formulario')
      }}
    >
      <DialogTrigger render={<Button disabled={deshabilitado} />}>Publicar oferta</DialogTrigger>
      <DialogContent>
        {paso === 'formulario' ? (
          <>
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
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="operacion" className="mb-1.5 block">Operación</Label>
                  <select
                    id="operacion"
                    value={form.operacion}
                    onChange={(e) => actualizar('operacion', e.target.value as OfertaInput['operacion'])}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="compra">Compra</option>
                    <option value="venta">Venta</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="moneda" className="mb-1.5 block">Moneda</Label>
                  <select
                    id="moneda"
                    value={form.moneda}
                    onChange={(e) => actualizar('moneda', e.target.value as OfertaInput['moneda'])}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cantidad" className="mb-1.5 block">Cantidad</Label>
                  <Input
                    id="cantidad"
                    type="text"
                    inputMode="decimal"
                    value={form.cantidad}
                    onChange={(e) => actualizar('cantidad', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="precioCop" className="mb-1.5 block">Precio (COP)</Label>
                  <Input
                    id="precioCop"
                    type="text"
                    inputMode="decimal"
                    value={form.precioCop}
                    onChange={(e) => actualizar('precioCop', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">Condiciones</Label>
                <div className="flex flex-wrap gap-3">
                  {CONDICIONES.map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={form.condiciones.includes(c)}
                        onChange={() => alternarCondicion(c)}
                      />
                      {ETIQUETA_CONDICION[c]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="sede" className="mb-1.5 block">Sede (opcional)</Label>
                <Input
                  id="sede"
                  type="text"
                  placeholder="Oviedo"
                  value={form.sede}
                  onChange={(e) => actualizar('sede', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="notas" className="mb-1.5 block">Notas (opcional)</Label>
                <Textarea
                  id="notas"
                  rows={2}
                  placeholder="Ej.: están en billetes de 20"
                  value={form.notas}
                  onChange={(e) => actualizar('notas', e.target.value)}
                />
              </div>
              {errorValidacion && (
                <Alert variant="destructive">
                  <AlertDescription>{errorValidacion}</AlertDescription>
                </Alert>
              )}
              <Button type="button" onClick={revisar} disabled={deshabilitado}>
                Revisar oferta
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Así se verá su oferta</DialogTitle>
              <DialogDescription>
                Revísela antes de publicar. Expirará automáticamente 24 horas
                después de confirmar.
              </DialogDescription>
            </DialogHeader>
            <TarjetaOferta
              oferta={{
                id: 'preview',
                empresa,
                sede: form.sede || null,
                operacion: form.operacion,
                moneda: form.moneda,
                cantidad: Number(form.cantidad) || 0,
                precioCop: Number(form.precioCop) || 0,
                condiciones: form.condiciones,
                notas: form.notas || null,
                expiraEn: expiraPreview,
              }}
            />
            <form action={formAction} className="grid gap-3">
              <input type="hidden" name="operacion" value={form.operacion} />
              <input type="hidden" name="moneda" value={form.moneda} />
              <input type="hidden" name="cantidad" value={form.cantidad} />
              <input type="hidden" name="precioCop" value={form.precioCop} />
              {form.condiciones.map((c) => (
                <input key={c} type="hidden" name="condiciones" value={c} />
              ))}
              <input type="hidden" name="sede" value={form.sede} />
              <input type="hidden" name="notas" value={form.notas} />
              {state.error && (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setPaso('formulario')} disabled={pending}>
                  Volver a editar
                </Button>
                <Button type="submit" disabled={pending} className="flex-1">
                  {pending ? 'Publicando…' : 'Confirmar y publicar'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
