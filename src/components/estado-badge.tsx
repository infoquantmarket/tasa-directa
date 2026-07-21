import { Badge } from '@/components/ui/badge'
import type { EstadoPerfil, EstadoDoc, EstadoVerificacionIdentidad } from '@/types/database'

const ESTILOS: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  aprobado: 'bg-green-100 text-green-800 border-green-200',
  rechazado: 'bg-red-100 text-red-700 border-red-200',
  suspendido: 'bg-slate-200 text-slate-700 border-slate-300',
  // Estados de Didit (verificación de identidad del representante legal)
  'Not Started': 'bg-slate-200 text-slate-700 border-slate-300',
  'In Progress': 'bg-amber-100 text-amber-800 border-amber-200',
  'Awaiting User': 'bg-amber-100 text-amber-800 border-amber-200',
  Resubmitted: 'bg-amber-100 text-amber-800 border-amber-200',
  'In Review': 'bg-amber-100 text-amber-800 border-amber-200',
  Approved: 'bg-green-100 text-green-800 border-green-200',
  Declined: 'bg-red-100 text-red-700 border-red-200',
  Abandoned: 'bg-red-100 text-red-700 border-red-200',
  Expired: 'bg-red-100 text-red-700 border-red-200',
  'Kyc Expired': 'bg-red-100 text-red-700 border-red-200',
}

const ETIQUETAS: Record<string, string> = {
  pendiente: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  suspendido: 'Suspendido',
  // Estados de Didit (verificación de identidad del representante legal)
  'Not Started': 'No iniciada',
  'In Progress': 'En proceso',
  'Awaiting User': 'Esperando al usuario',
  Resubmitted: 'Reenviada',
  'In Review': 'En revisión',
  Approved: 'Aprobada',
  Declined: 'Rechazada',
  Abandoned: 'Abandonada',
  Expired: 'Expirada',
  'Kyc Expired': 'KYC expirado',
}

export function EstadoBadge({
  estado,
}: {
  estado: EstadoPerfil | EstadoDoc | EstadoVerificacionIdentidad
}) {
  return (
    <Badge variant="outline" className={ESTILOS[estado]}>
      {ETIQUETAS[estado]}
    </Badge>
  )
}
