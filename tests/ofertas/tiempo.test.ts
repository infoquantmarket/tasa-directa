import { describe, it, expect } from 'vitest'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'

describe('formatearCuentaRegresiva', () => {
  it('muestra horas y minutos cuando faltan más de 1 hora', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = new Date('2026-07-21T18:30:00Z').toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Vence en 6h 30min')
  })
  it('muestra solo minutos cuando falta menos de 1 hora', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = new Date('2026-07-21T12:45:00Z').toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Vence en 45min')
  })
  it('dice "Expirada" si expira_en ya pasó', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = new Date('2026-07-21T11:00:00Z').toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Expirada')
  })
  it('dice "Expirada" justo en el límite (0 minutos restantes)', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = ahora.toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Expirada')
  })
})
