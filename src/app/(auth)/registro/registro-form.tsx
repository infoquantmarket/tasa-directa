'use client'

import { useActionState } from 'react'
import { registrarse, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const CAMPOS = [
  { name: 'razonSocial', label: 'Razón social *', placeholder: 'Nutifinanzas S.A.S.', type: 'text' },
  { name: 'nit', label: 'NIT *', placeholder: '901234567-8', type: 'text' },
  { name: 'sede', label: 'Sede principal *', placeholder: 'Oviedo', type: 'text' },
  { name: 'ciudad', label: 'Ciudad *', placeholder: 'Medellín', type: 'text' },
  { name: 'telefono', label: 'Teléfono fijo', placeholder: '6044442211', type: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', placeholder: '3001234567', type: 'tel' },
  { name: 'correo', label: 'Correo corporativo *', placeholder: 'contacto@suempresa.co', type: 'email' },
  { name: 'password', label: 'Contraseña * (mínimo 8 caracteres)', placeholder: '••••••••', type: 'password' },
] as const

export function RegistroForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    registrarse,
    { error: null }
  )

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {CAMPOS.map((campo) => (
        <div
          key={campo.name}
          className={campo.name === 'correo' || campo.name === 'password' ? 'sm:col-span-2' : ''}
        >
          <Label htmlFor={campo.name} className="mb-1.5 block">{campo.label}</Label>
          <Input
            id={campo.name}
            name={campo.name}
            type={campo.type}
            placeholder={campo.placeholder}
            required={campo.label.includes('*')}
          />
        </div>
      ))}
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="sm:col-span-2" size="lg">
        {pending ? 'Enviando…' : 'Crear cuenta de PCD'}
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Al registrarse, su empresa entra en proceso de verificación documental.
        Solo los Profesionales de Compra y Venta de Divisas aprobados por nuestro
        equipo de cumplimiento acceden al mercado.
      </p>
    </form>
  )
}
