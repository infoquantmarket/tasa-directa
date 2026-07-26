import { ModalCalificar } from './modal-calificar'
import type { TratoPorCalificar } from '@/lib/ofertas/tratos-por-calificar'

export function BannerPorCalificar({ tratos }: { tratos: TratoPorCalificar[] }) {
  if (!tratos.length) return null

  return (
    <div className="mb-6 grid gap-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        Tiene {tratos.length} trato{tratos.length > 1 ? 's' : ''} completado{tratos.length > 1 ? 's' : ''} por calificar
      </p>
      <div className="grid gap-2">
        {tratos.map((t) => (
          <div key={t.ofertaId} className="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm">
            <div>
              <p className="font-medium">{t.contraparte}</p>
              <p className="text-xs text-muted-foreground">{t.resumen}</p>
            </div>
            <ModalCalificar ofertaId={t.ofertaId} contraparte={t.contraparte} resumen={t.resumen} />
          </div>
        ))}
      </div>
    </div>
  )
}
