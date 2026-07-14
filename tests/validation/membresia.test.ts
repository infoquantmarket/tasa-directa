import { describe, it, expect } from 'vitest'
import { esMembresiaVigente } from '@/lib/validation/membresia'

const HOY = '2026-07-14'

describe('esMembresiaVigente', () => {
  it('true: activa sin fecha de fin', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-01-01', fecha_fin: null }, HOY)).toBe(true)
  })
  it('true: activa con fin en el futuro', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01' }, HOY)).toBe(true)
  })
  it('true: fin exactamente hoy (inclusive)', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-07-01', fecha_fin: HOY }, HOY)).toBe(true)
  })
  it('false: fecha_fin ya pasó', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-01-01', fecha_fin: '2026-07-13' }, HOY)).toBe(false)
  })
  it('false: aún no inicia', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-08-01', fecha_fin: null }, HOY)).toBe(false)
  })
  it('false: cancelada o vencida aunque las fechas cubran hoy', () => {
    expect(esMembresiaVigente({ estado: 'cancelada', fecha_inicio: '2026-01-01', fecha_fin: null }, HOY)).toBe(false)
    expect(esMembresiaVigente({ estado: 'vencida', fecha_inicio: '2026-01-01', fecha_fin: null }, HOY)).toBe(false)
  })
  it('false: null (sin membresía)', () => {
    expect(esMembresiaVigente(null, HOY)).toBe(false)
  })
})
