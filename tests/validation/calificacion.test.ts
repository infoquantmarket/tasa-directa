import { describe, it, expect } from 'vitest'
import { calificacionSchema } from '@/lib/validation/calificacion'

describe('calificacionSchema', () => {
  it('acepta de 1 a 5 estrellas sin comentario', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(calificacionSchema.safeParse({ estrellas: String(n), comentario: '' }).success).toBe(true)
    }
  })
  it('acepta un comentario opcional', () => {
    expect(calificacionSchema.safeParse({
      estrellas: '5', comentario: 'Cumplió todo a tiempo, excelente contraparte.',
    }).success).toBe(true)
  })
  it('rechaza 0 estrellas', () => {
    expect(calificacionSchema.safeParse({ estrellas: '0', comentario: '' }).success).toBe(false)
  })
  it('rechaza 6 estrellas', () => {
    expect(calificacionSchema.safeParse({ estrellas: '6', comentario: '' }).success).toBe(false)
  })
  it('rechaza estrellas no numéricas', () => {
    expect(calificacionSchema.safeParse({ estrellas: 'muchas', comentario: '' }).success).toBe(false)
  })
  it('rechaza sin estrellas', () => {
    expect(calificacionSchema.safeParse({ comentario: '' }).success).toBe(false)
  })
  it('rechaza un comentario de más de 500 caracteres', () => {
    expect(calificacionSchema.safeParse({ estrellas: '5', comentario: 'a'.repeat(501) }).success).toBe(false)
  })
  it('acepta exactamente 500 caracteres', () => {
    expect(calificacionSchema.safeParse({ estrellas: '5', comentario: 'a'.repeat(500) }).success).toBe(true)
  })
})
