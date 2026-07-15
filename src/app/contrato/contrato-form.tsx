'use client'

import { useActionState, useState } from 'react'
import { aceptarTerminos, type ContratoState } from './actions'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CONTRATO_SERVICIOS, TRATAMIENTO_DATOS } from '@/lib/legal/contrato'

export function ContratoForm() {
  const [state, formAction, pending] = useActionState<ContratoState, FormData>(
    aceptarTerminos,
    { error: null }
  )
  const [aceptaContrato, setAceptaContrato] = useState(false)
  const [aceptaDatos, setAceptaDatos] = useState(false)

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-2">
        <h3 className="font-semibold">Contrato de prestación de servicios</h3>
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {CONTRATO_SERVICIOS}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="contrato"
            checked={aceptaContrato}
            onChange={(e) => setAceptaContrato(e.target.checked)}
            className="mt-0.5"
          />
          He leído y acepto el contrato de servicios.
        </label>
      </div>

      <div className="grid gap-2">
        <h3 className="font-semibold">Autorización de tratamiento de datos personales</h3>
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {TRATAMIENTO_DATOS}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="datos"
            checked={aceptaDatos}
            onChange={(e) => setAceptaDatos(e.target.checked)}
            className="mt-0.5"
          />
          Autorizo el tratamiento de mis datos personales.
        </label>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending || !aceptaContrato || !aceptaDatos} size="lg" className="w-fit">
        {pending ? 'Guardando…' : 'Aceptar y continuar'}
      </Button>
    </form>
  )
}
