'use client'

import { useActionState } from 'react'
import { iniciarVerificacionIdentidad, type VerificacionIdentidadState } from './actions'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import type { EstadoVerificacionIdentidad } from '@/types/database'

// 'Not Started' NO se incluye aquí a propósito: es el estado inicial de una
// sesión recién creada, pero si el usuario abandona el flujo de Didit antes
// de siquiera empezarlo (cierra la pestaña), la fila queda en 'Not Started'
// para siempre — sin webhook que la actualice. Tratarlo como "en proceso"
// dejaría al usuario sin botón para reintentar de forma permanente. Crear
// una sesión nueva en ese caso es seguro: el diseño ya tolera sesiones
// huérfanas (ver docs/superpowers/specs/2026-07-21-verificacion-identidad-didit-design.md).
const ESTADOS_EN_PROCESO: EstadoVerificacionIdentidad[] = [
  'In Progress', 'Awaiting User', 'Resubmitted',
]
const ESTADOS_RECHAZADOS: EstadoVerificacionIdentidad[] = [
  'Declined', 'Abandoned', 'Expired', 'Kyc Expired',
]

export function VerificacionIdentidad({
  estado,
  repCompleto,
}: {
  estado: EstadoVerificacionIdentidad | null
  repCompleto: boolean
}) {
  const [state, formAction, pending] = useActionState<VerificacionIdentidadState, FormData>(
    iniciarVerificacionIdentidad,
    { error: null }
  )

  if (estado === 'Approved') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" />
        Identidad del representante legal verificada.
      </p>
    )
  }

  if (estado === 'In Review') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4 text-primary" />
        Verificación en revisión por Didit.
      </p>
    )
  }

  if (estado && ESTADOS_EN_PROCESO.includes(estado)) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4 text-primary" />
        Verificación en proceso. Si el representante legal aún no completó el
        flujo, puede continuar desde el enlace que se abrió al iniciarla.
      </p>
    )
  }

  return (
    <div className="grid gap-3">
      {estado && ESTADOS_RECHAZADOS.includes(estado) && (
        <p className="flex items-center gap-1.5 text-sm text-red-700">
          <XCircle className="size-4" />
          La verificación anterior no se completó o fue rechazada. Puede intentar de nuevo.
        </p>
      )}
      {!repCompleto && (
        <p className="text-sm text-muted-foreground">
          Guarde primero los datos del representante legal (arriba) para
          poder iniciar la verificación.
        </p>
      )}
      <form action={formAction}>
        {state.error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending || !repCompleto}>
          {pending ? 'Iniciando…' : 'Verificar identidad'}
        </Button>
      </form>
    </div>
  )
}
