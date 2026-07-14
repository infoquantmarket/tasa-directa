'use client'

import { useActionState, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { registrarse, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CIUDADES_COLOMBIA, etiquetaCiudad } from '@/lib/data/ciudades-colombia'

const CAMPOS_ANTES = [
  { name: 'razonSocial', label: 'Razón social *', placeholder: 'Nutifinanzas S.A.S.', type: 'text' },
  { name: 'nit', label: 'NIT *', placeholder: '901234567-8', type: 'text' },
  { name: 'sede', label: 'Sede principal *', placeholder: 'Oviedo', type: 'text' },
] as const

const CAMPOS_DESPUES = [
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

  // Cuando la Server Action responde con un error, React (vía el reset nativo del
  // formulario tras el dispatch de la acción) borra los valores no controlados.
  // Forzamos el remonte de los inputs (cambiando su `key`) para que React vuelva
  // a aplicar `defaultValue` con lo que el usuario había escrito. Se ajusta el
  // estado durante el render (patrón "adjust state while rendering" de React,
  // en vez de un efecto) comparando contra el `state` del render anterior.
  const [resetKey, setResetKey] = useState(0)
  const [ciudadOpen, setCiudadOpen] = useState(false)
  const [selectedCiudad, setSelectedCiudad] = useState(state.valores?.ciudad ?? '')
  const [prevState, setPrevState] = useState(state)

  if (state !== prevState) {
    setPrevState(state)
    if (state.error) {
      setResetKey((k) => k + 1)
      setSelectedCiudad(state.valores?.ciudad ?? '')
    }
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {CAMPOS_ANTES.map((campo) => (
        <div key={`${campo.name}-${resetKey}`}>
          <Label htmlFor={campo.name} className="mb-1.5 block">{campo.label}</Label>
          <Input
            id={campo.name}
            name={campo.name}
            type={campo.type}
            placeholder={campo.placeholder}
            required={campo.label.includes('*')}
            defaultValue={state.valores?.[campo.name] ?? ''}
          />
        </div>
      ))}

      <div>
        <Label htmlFor="ciudad-trigger" className="mb-1.5 block">Ciudad *</Label>
        <Popover open={ciudadOpen} onOpenChange={setCiudadOpen}>
          <PopoverTrigger
            render={
              <Button
                id="ciudad-trigger"
                type="button"
                variant="outline"
                className="w-full justify-between font-normal"
              />
            }
          >
            <span className={cn(!selectedCiudad && 'text-muted-foreground')}>
              {selectedCiudad || 'Seleccione una ciudad'}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Buscar ciudad..." />
              <CommandList>
                <CommandEmpty>No se encontró la ciudad.</CommandEmpty>
                <CommandGroup>
                  {CIUDADES_COLOMBIA.map((c) => {
                    const etiqueta = etiquetaCiudad(c)
                    return (
                      <CommandItem
                        key={etiqueta}
                        value={etiqueta}
                        onSelect={(value) => {
                          setSelectedCiudad(value)
                          setCiudadOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 size-4',
                            selectedCiudad === etiqueta ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {etiqueta}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <input type="hidden" name="ciudad" value={selectedCiudad} required />
      </div>

      {CAMPOS_DESPUES.map((campo) => (
        <div
          key={`${campo.name}-${resetKey}`}
          className={campo.name === 'correo' || campo.name === 'password' ? 'sm:col-span-2' : ''}
        >
          <Label htmlFor={campo.name} className="mb-1.5 block">{campo.label}</Label>
          <Input
            id={campo.name}
            name={campo.name}
            type={campo.type}
            placeholder={campo.placeholder}
            required={campo.label.includes('*')}
            defaultValue={campo.name !== 'password' ? state.valores?.[campo.name] ?? '' : undefined}
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
