'use client'

import { useActionState, useState } from 'react'
import { registrarse, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function RegistroForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    registrarse,
    { error: null }
  )

  // Mismo patrón de preservación de valores en error que el resto del proyecto
  // (ver docs/superpowers/plans — "adjust state while rendering"): solo se
  // conserva el correo; la contraseña se limpia en cada intento, lo cual es
  // aceptable y esperado.
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
        <Label htmlFor="correo" className="mb-1.5 block">Correo *</Label>
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
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña * (mínimo 8 caracteres)</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="new-password"
        />
      </div>
      <div>
        <Label htmlFor="confirmar" className="mb-1.5 block">Confirmar contraseña *</Label>
        <Input
          id="confirmar"
          name="confirmar"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="new-password"
        />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Después de confirmar su correo, completará el perfil de su empresa y cargará
        los documentos de vinculación.
      </p>
    </form>
  )
}
