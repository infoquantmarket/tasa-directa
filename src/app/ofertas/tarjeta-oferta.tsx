'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'
import { soloCiudad } from '@/lib/data/areas-metropolitanas'
import { cn } from '@/lib/utils'
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
  ciudad: string | null
  operacion: Operacion | null
  moneda: Moneda
  cantidad: number
  precioCop: number
  condiciones: Condicion[]
  notas: string | null
  expiraEn: string
  destacada?: boolean
  /** Solo se pasa desde el tablero (`/ofertas`); si se omite, no se muestra la línea de estrellas. */
  reputacion?: { promedio: number; total: number } | null
}

export function TarjetaOferta({
  oferta,
  acciones,
}: {
  oferta: DatosOferta
  acciones?: React.ReactNode
}) {
  const destacada = Boolean(oferta.destacada)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_PRO } }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
    >
      <Card
        className={cn(
          'transition-shadow duration-300 hover:shadow-lg',
          destacada && 'border-amber-300 bg-amber-50/50'
        )}
      >
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {destacada && (
                <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">
                  <Star className="size-3 fill-current" /> Destacada
                </Badge>
              )}
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
            </div>
            <CardDescription className="mt-1.5">
              {oferta.empresa}
              {oferta.sede ? ` · ${oferta.sede}` : ''}
              {oferta.ciudad ? ` · ${soloCiudad(oferta.ciudad)}` : ''}
            </CardDescription>
            {oferta.reputacion !== undefined && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {oferta.reputacion ? (
                  <>
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {oferta.reputacion.promedio.toFixed(1)} ({oferta.reputacion.total})
                  </>
                ) : (
                  'Sin calificaciones aún'
                )}
              </p>
            )}
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
