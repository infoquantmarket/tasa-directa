import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'
import type { Condicion, Moneda, Operacion } from '@/types/database'

const ETIQUETA_CONDICION: Record<Condicion, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  para_recoger: 'Para recoger',
  en_oficina: 'En oficina',
}

export interface DatosOferta {
  id: string
  empresa: string
  sede: string | null
  operacion: Operacion | null
  moneda: Moneda
  cantidad: number
  precioCop: number
  condiciones: Condicion[]
  notas: string | null
  expiraEn: string
}

export function TarjetaOferta({
  oferta,
  acciones,
}: {
  oferta: DatosOferta
  acciones?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            {oferta.operacion === 'venta' ? 'Vende' : 'Compra'} {oferta.moneda}
          </CardTitle>
          <CardDescription>
            {oferta.empresa}{oferta.sede ? ` · ${oferta.sede}` : ''}
          </CardDescription>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {formatearCuentaRegresiva(oferta.expiraEn)}
        </span>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cantidad</span>
          <span className="font-medium">{oferta.cantidad.toLocaleString('es-CO')} {oferta.moneda}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Precio</span>
          <span className="font-medium">${oferta.precioCop.toLocaleString('es-CO')} COP</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {oferta.condiciones.map((c) => (
            <span key={c} className="rounded-full bg-accent/40 px-2 py-0.5 text-xs">
              {ETIQUETA_CONDICION[c]}
            </span>
          ))}
        </div>
        {oferta.notas && <p className="text-muted-foreground">{oferta.notas}</p>}
        {acciones}
      </CardContent>
    </Card>
  )
}
