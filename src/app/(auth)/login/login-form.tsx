'use client'

import { useActionState } from 'react'
import { iniciarSesion, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginForm({ errorInicial }: { errorInicial?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    iniciarSesion,
    { error: errorInicial ?? null }
  )

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <Label htmlFor="correo" className="mb-1.5 block">Correo</Label>
        <Input id="correo" name="correo" type="email" required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}
