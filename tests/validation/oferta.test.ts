import { describe, it, expect } from 'vitest'
import { ofertaSchema, MONEDAS, CONDICIONES } from '@/lib/validation/oferta'

const base = {
  operacion: 'compra' as const,
  moneda: 'USD' as const,
  cantidad: '1000',
  precioCop: '4200',
  condiciones: ['efectivo'] as const,
  sede: 'Oviedo',
  notas: '',
}

describe('constantes', () => {
  it('MONEDAS tiene las 25 monedas soportadas, en el orden de despliegue', () => {
    expect(MONEDAS).toEqual([
      'USD', 'EUR', 'MXN', 'CAD',
      'CRC', 'NOK', 'SEK', 'AUD', 'NZD', 'AWG', 'ANG', 'CHF', 'GBP', 'TRY', 'PEN',
      'ARS', 'BOB', 'CLP', 'DOP', 'UYU', 'GTQ', 'BRL', 'INR', 'JPY', 'CNY',
    ])
  })
  it('CONDICIONES tiene las 4 condiciones del esquema original', () => {
    expect(CONDICIONES).toEqual(['efectivo', 'transferencia', 'para_recoger', 'en_oficina'])
  })
})

describe('ofertaSchema', () => {
  it('acepta una oferta válida completa', () => {
    expect(ofertaSchema.safeParse(base).success).toBe(true)
  })
  it('acepta notas y sede vacías (opcionales)', () => {
    expect(ofertaSchema.safeParse({ ...base, notas: '', sede: '' }).success).toBe(true)
  })
  it('rechaza operación inválida', () => {
    expect(ofertaSchema.safeParse({ ...base, operacion: 'venta_al_por_mayor' }).success).toBe(false)
  })
  it('rechaza moneda no soportada', () => {
    expect(ofertaSchema.safeParse({ ...base, moneda: 'BTC' }).success).toBe(false)
  })
  it('rechaza cantidad no positiva', () => {
    expect(ofertaSchema.safeParse({ ...base, cantidad: '0' }).success).toBe(false)
    expect(ofertaSchema.safeParse({ ...base, cantidad: '-5' }).success).toBe(false)
  })
  it('rechaza precio no positivo', () => {
    expect(ofertaSchema.safeParse({ ...base, precioCop: '0' }).success).toBe(false)
  })
  it('rechaza cantidad no numérica', () => {
    expect(ofertaSchema.safeParse({ ...base, cantidad: 'mil' }).success).toBe(false)
  })
  it('rechaza sin ninguna condición marcada', () => {
    expect(ofertaSchema.safeParse({ ...base, condiciones: [] }).success).toBe(false)
  })
  it('rechaza una condición no reconocida', () => {
    expect(ofertaSchema.safeParse({ ...base, condiciones: ['bitcoin'] }).success).toBe(false)
  })
})
