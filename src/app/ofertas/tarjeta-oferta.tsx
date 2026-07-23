'use client'

import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'
import type { Condicion, Moneda, Operacion } from '@/types/database'

const EASE_PRO = [0.22, 1, 0.36, 1] as const

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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_PRO } }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
    >
      <Card className="transition-shadow duration-300 hover:shadow-lg">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <Badge
              variant="outline"
              className={
                oferta.operacion === 'venta'
                  ? 'border-primary/20 bg-primary/10 text-primary'
                  : 'border-slate-200 bg-slate-100 text-slate-700'
              }
            >
              {oferta.operacion === 'venta' ? 'Vende' : 'Compra'} {oferta.moneda}
            </Badge>
            <CardDescription className="mt-1.5">
              {oferta.empresa}{oferta.sede ? ` · ${oferta.sede}` : ''}
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {formatearCuentaRegresiva(oferta.expiraEn)}
          </span>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio</span>
            <span className="text-xl font-bold text-foreground">${oferta.precioCop.toLocaleString('es-CO')} COP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cantidad</span>
            <span className="font-medium">{oferta.cantidad.toLocaleString('es-CO')} {oferta.moneda}</span>
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
    </motion.div>
  )
}
