import { z } from 'zod'

export const MONEDAS = [
  'USD', 'EUR', 'MXN', 'CAD',
  'CRC', 'NOK', 'SEK', 'AUD', 'NZD', 'AWG', 'ANG', 'CHF', 'GBP', 'TRY', 'PEN',
  'ARS', 'BOB', 'CLP', 'DOP', 'UYU', 'GTQ', 'BRL', 'INR', 'JPY', 'CNY',
] as const
export const CONDICIONES = ['efectivo', 'transferencia', 'para_recoger', 'en_oficina'] as const

const numeroPositivo = z.string().refine(
  (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0
  },
  { message: 'Debe ser un número mayor que cero' }
)

export const ofertaSchema = z.object({
  operacion: z.enum(['compra', 'venta']),
  moneda: z.enum(MONEDAS),
  cantidad: numeroPositivo,
  precioCop: numeroPositivo,
  condiciones: z.array(z.enum(CONDICIONES)).min(1, 'Seleccione al menos una condición'),
  sede: z.string().optional(),
  notas: z.string().optional(),
})

export type OfertaInput = z.infer<typeof ofertaSchema>
