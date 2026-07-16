'use client'

import { useActionState } from 'react'
import { actualizarContrasena, type RestablecerState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function RestablecerForm() {
  const [state, formAction, pending] = useActionState<RestablecerState, FormData>(
    actualizarContrasena,
    { error: null }
  )

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña nueva (mínimo 8 caracteres)</Label>
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
        <Label htmlFor="confirmar" className="mb-1.5 block">Confirmar contraseña nueva</Label>
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
        {pending ? 'Guardando…' : 'Guardar contraseña nueva'}
      </Button>
    </form>
  )
}
