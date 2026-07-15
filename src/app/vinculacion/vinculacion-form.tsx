'use client'

import { useActionState, useState } from 'react'
import { guardarPerfil, type PerfilState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CiudadCombobox } from '@/app/(auth)/registro/ciudad-combobox'
import { TIPOS_SOCIEDAD, TIPOS_DOC_REP } from '@/lib/validation/perfil'
import { documentoPorSlug } from '@/lib/legal/documentos'

type CampoTexto = {
  name: string
  label: string
  tipo: 'text' | 'tel' | 'email' | 'url'
  req?: boolean
  placeholder?: string
  full?: boolean
}
type CampoSelect = {
  name: string
  label: string
  tipo: 'select'
  req?: boolean
  opciones: ReadonlyArray<{ valor: string; etiqueta: string }>
}
type Campo = CampoTexto | CampoSelect

interface Seccion {
  titulo: string
  campos: Campo[]
}

const SECCIONES: Seccion[] = [
  {
    titulo: 'Datos de la empresa',
    campos: [
      { name: 'razonSocial', label: 'Razón social', tipo: 'text', req: true, placeholder: 'Nutifinanzas S.A.S.' },
      { name: 'nombreComercial', label: 'Nombre comercial', tipo: 'text' },
      { name: 'nit', label: 'NIT', tipo: 'text', req: true, placeholder: '901234567-8' },
      { name: 'tipoSociedad', label: 'Tipo de sociedad', tipo: 'select', req: true, opciones: TIPOS_SOCIEDAD },
      { name: 'sede', label: 'Sede principal', tipo: 'text', req: true, placeholder: 'Oviedo' },
      { name: 'direccion', label: 'Dirección exacta', tipo: 'text', req: true, placeholder: 'Cra 43A #6 Sur-15, Of. 201', full: true },
      { name: 'telefono', label: 'Teléfono fijo', tipo: 'tel', placeholder: '6044442211' },
      { name: 'sitioWeb', label: 'Sitio web', tipo: 'url', placeholder: 'https://...' },
    ],
  },
  {
    titulo: 'Representante legal',
    campos: [
      { name: 'repNombre', label: 'Nombre completo', tipo: 'text', req: true },
      { name: 'repTipoDoc', label: 'Tipo de documento', tipo: 'select', req: true, opciones: TIPOS_DOC_REP.map((v) => ({ valor: v, etiqueta: v })) },
      { name: 'repNumDoc', label: 'Número de documento', tipo: 'text', req: true },
      { name: 'repCorreo', label: 'Correo', tipo: 'email', req: true },
      { name: 'repCelular', label: 'Celular', tipo: 'tel', req: true },
    ],
  },
  {
    titulo: 'Persona de contacto',
    campos: [
      { name: 'contactoNombre', label: 'Nombre', tipo: 'text', req: true },
      { name: 'contactoCargo', label: 'Cargo', tipo: 'text' },
      { name: 'contactoCelular', label: 'Celular', tipo: 'tel', req: true },
      { name: 'contactoCorreo', label: 'Correo', tipo: 'email', req: true },
      { name: 'contactoWhatsapp', label: 'WhatsApp', tipo: 'tel' },
    ],
  },
]

// Mismas clases que src/components/ui/input.tsx (el proyecto no tiene un
// componente Select — se estiliza el <select> nativo para que calce con Input).
const selectClases =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80'

export function VinculacionForm({
  valoresIniciales,
  yaAceptoDatos,
}: {
  valoresIniciales: Record<string, string>
  yaAceptoDatos?: boolean
}) {
  const [state, formAction, pending] = useActionState<PerfilState, FormData>(
    guardarPerfil,
    { error: null, valores: valoresIniciales }
  )

  const [resetKey, setResetKey] = useState(0)
  const [ciudad, setCiudad] = useState(state.valores?.ciudad ?? valoresIniciales.ciudad ?? '')
  const [prevState, setPrevState] = useState(state)

  if (state !== prevState) {
    setPrevState(state)
    if (state.error) {
      setResetKey((k) => k + 1)
      setCiudad(state.valores?.ciudad ?? '')
    }
  }

  const valores: Record<string, string> = state.valores ?? valoresIniciales
  const docDatos = documentoPorSlug('tratamiento_datos')!

  return (
    <form action={formAction} className="grid gap-8">
      {SECCIONES.map((seccion) => (
        <div key={seccion.titulo} className="grid gap-4">
          <h3 className="font-semibold">{seccion.titulo}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {seccion.campos.map((campo) => (
              <div
                key={`${campo.name}-${resetKey}`}
                className={'full' in campo && campo.full ? 'sm:col-span-2' : ''}
              >
                <Label htmlFor={campo.name} className="mb-1.5 block">
                  {campo.label}{campo.req ? ' *' : ''}
                </Label>
                {campo.tipo === 'select' ? (
                  <select
                    id={campo.name}
                    name={campo.name}
                    required={campo.req}
                    defaultValue={valores[campo.name] ?? ''}
                    className={selectClases}
                  >
                    <option value="" disabled>Seleccione…</option>
                    {campo.opciones.map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={campo.name}
                    name={campo.name}
                    type={campo.tipo}
                    placeholder={campo.placeholder}
                    required={campo.req}
                    defaultValue={valores[campo.name] ?? ''}
                  />
                )}
              </div>
            ))}
            {seccion.titulo === 'Datos de la empresa' && (
              <div>
                <Label htmlFor="ciudad-trigger" className="mb-1.5 block">Ciudad *</Label>
                <CiudadCombobox value={ciudad} onChange={setCiudad} />
              </div>
            )}
          </div>
        </div>
      ))}

      {!yaAceptoDatos && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="autorizacion_datos" className="mt-0.5" />
          <span>
            {docDatos.etiquetaCasilla}{' '}
            <a href="/legal/tratamiento_datos" target="_blank" className="text-primary hover:underline">
              Ver autorización
            </a>{' '}
            ·{' '}
            <a href="/legal/politica_tratamiento" target="_blank" className="text-primary hover:underline">
              Política de Tratamiento
            </a>
          </span>
        </label>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg" className="w-fit">
        {pending ? 'Guardando…' : 'Guardar perfil'}
      </Button>
    </form>
  )
}
