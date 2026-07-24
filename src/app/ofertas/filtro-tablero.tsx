'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { grupoDe, type GrupoMetropolitano } from '@/lib/data/areas-metropolitanas'
import { TarjetaOferta, type DatosOferta } from './tarjeta-oferta'
import { ModalRealizarOferta } from './modal-realizar-oferta'
import type { Moneda, Operacion } from '@/types/database'

const EASE_PRO = [0.22, 1, 0.36, 1] as const

type FiltroOperacion = 'todas' | Operacion
type Orden = 'reciente' | 'vence_pronto'

const ZONA_MI_ZONA = '__mi_zona__'
const ZONA_TODAS = '__todas__'

const PILLS: { valor: FiltroOperacion; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'compra', etiqueta: 'Compra' },
  { valor: 'venta', etiqueta: 'Venta' },
]

export function FiltroTablero({
  ofertas,
  miZona,
}: {
  ofertas: DatosOferta[]
  miZona: GrupoMetropolitano | null
}) {
  const [operacion, setOperacion] = useState<FiltroOperacion>('todas')
  const [moneda, setMoneda] = useState<Moneda | 'todas'>('todas')
  const [orden, setOrden] = useState<Orden>('reciente')
  const [zona, setZona] = useState<string>(miZona ? ZONA_MI_ZONA : ZONA_TODAS)

  const monedasDisponibles = useMemo(
    () => [...new Set(ofertas.map((o) => o.moneda))].sort(),
    [ofertas]
  )

  // Zonas con al menos una oferta activa ahora mismo, además de "Mi zona" y
  // "Todas" (que siempre están disponibles). Se identifican por nombre de
  // grupo metropolitano para no repetir "Valle de Aburrá" una vez por ciudad.
  const zonasDisponibles = useMemo(() => {
    const mapa = new Map<string, GrupoMetropolitano>()
    for (const o of ofertas) {
      if (!o.ciudad) continue
      const g = grupoDe(o.ciudad)
      if (g.nombre !== miZona?.nombre) mapa.set(g.nombre, g)
    }
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [ofertas, miZona])

  const ofertasFiltradas = useMemo(() => {
    const filtradas = ofertas.filter((o) => {
      if (operacion !== 'todas' && o.operacion !== operacion) return false
      if (moneda !== 'todas' && o.moneda !== moneda) return false
      if (zona === ZONA_MI_ZONA) {
        if (!miZona || !o.ciudad || !miZona.ciudades.includes(o.ciudad)) return false
      } else if (zona !== ZONA_TODAS) {
        const zonaElegida = zonasDisponibles.find((z) => z.nombre === zona)
        if (!zonaElegida || !o.ciudad || !zonaElegida.ciudades.includes(o.ciudad)) return false
      }
      return true
    })
    if (orden === 'vence_pronto') {
      return [...filtradas].sort(
        (a, b) => new Date(a.expiraEn).getTime() - new Date(b.expiraEn).getTime()
      )
    }
    return filtradas
  }, [ofertas, operacion, moneda, orden, zona, miZona, zonasDisponibles])

  // Destacadas siempre arriba, más reciente primero entre ellas (el orden de
  // llegada ya viene de la consulta / del criterio elegido arriba).
  const destacadas = useMemo(() => ofertasFiltradas.filter((o) => o.destacada), [ofertasFiltradas])
  const normales = useMemo(() => ofertasFiltradas.filter((o) => !o.destacada), [ofertasFiltradas])

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{ofertasFiltradas.length}</span> ofertas activas en el mercado ahora
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-border bg-white p-1">
          {PILLS.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => setOperacion(p.valor)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                operacion === p.valor
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>

        <select
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {miZona && <option value={ZONA_MI_ZONA}>Mi zona · {miZona.nombre}</option>}
          {zonasDisponibles.map((z) => (
            <option key={z.nombre} value={z.nombre}>{z.nombre}</option>
          ))}
          <option value={ZONA_TODAS}>Todas las ciudades</option>
        </select>

        <select
          value={moneda}
          onChange={(e) => setMoneda(e.target.value as Moneda | 'todas')}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="todas">Todas las monedas</option>
          {monedasDisponibles.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="reciente">Más reciente primero</option>
          <option value="vence_pronto">Vence pronto primero</option>
        </select>
      </div>

      {ofertasFiltradas.length > 0 ? (
        <>
          {destacadas.length > 0 && (
            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                <Star className="size-4 fill-current text-amber-600" />
                <span className="text-sm font-medium">Destacadas</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {destacadas.map((oferta) => (
                  <TarjetaOferta
                    key={oferta.id}
                    oferta={oferta}
                    acciones={<ModalRealizarOferta ofertaId={oferta.id} />}
                  />
                ))}
              </div>
              <div className="my-6 border-t border-border" />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {normales.map((oferta) => (
              <TarjetaOferta
                key={oferta.id}
                oferta={oferta}
                acciones={<ModalRealizarOferta ofertaId={oferta.id} />}
              />
            ))}
          </div>
        </>
      ) : (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_PRO }}
          className="py-10 text-center text-muted-foreground"
        >
          Ninguna oferta coincide con el filtro.
        </motion.p>
      )}
    </div>
  )
}
