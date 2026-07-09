import { Badge } from '@/components/ui/badge'
import type { EstadoPerfil, EstadoDoc } from '@/types/database'

const ESTILOS: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  aprobado: 'bg-green-100 text-green-800 border-green-200',
  rechazado: 'bg-red-100 text-red-700 border-red-200',
  suspendido: 'bg-slate-200 text-slate-700 border-slate-300',
}

const ETIQUETAS: Record<string, string> = {
  pendiente: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  suspendido: 'Suspendido',
}

export function EstadoBadge({ estado }: { estado: EstadoPerfil | EstadoDoc }) {
  return (
    <Badge variant="outline" className={ESTILOS[estado]}>
      {ETIQUETAS[estado]}
    </Badge>
  )
}
