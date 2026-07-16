'use client'

import { useActionState, useState } from 'react'
import { solicitarRecuperacion, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    solicitarRecuperacion,
    { error: null }
  )

  const [resetKey, setResetKey] = useState(0)
  const [prevState, setPrevState] = useState(state)

  if (state !== prevState) {
    setPrevState(state)
    if (state.error) {
      setResetKey((k) => k + 1)
    }
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <Label htmlFor="correo" className="mb-1.5 block">Correo</Label>
        <Input
          key={`correo-${resetKey}`}
          id="correo"
          name="correo"
          type="email"
          placeholder="contacto@suempresa.co"
          required
          defaultValue={state.valores?.correo ?? ''}
          autoComplete="email"
        />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Enviando…' : 'Enviar enlace de recuperación'}
      </Button>
    </form>
  )
}
