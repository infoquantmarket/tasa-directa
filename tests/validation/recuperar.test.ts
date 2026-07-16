import { describe, it, expect } from 'vitest'
import { solicitarRecuperacionSchema, restablecerSchema } from '@/lib/validation/recuperar'

describe('solicitarRecuperacionSchema', () => {
  it('acepta un correo válido', () => {
    expect(solicitarRecuperacionSchema.safeParse({ correo: 'a@b.com' }).success).toBe(true)
  })

  it('rechaza un correo con formato inválido', () => {
    expect(solicitarRecuperacionSchema.safeParse({ correo: 'no-es-correo' }).success).toBe(false)
  })
})

describe('restablecerSchema', () => {
  it('acepta contraseñas de 8+ caracteres que coinciden', () => {
    const r = restablecerSchema.safeParse({ password: '12345678', confirmar: '12345678' })
    expect(r.success).toBe(true)
  })

  it('rechaza contraseñas de menos de 8 caracteres', () => {
    const r = restablecerSchema.safeParse({ password: '123', confirmar: '123' })
    expect(r.success).toBe(false)
  })

  it('rechaza cuando la confirmación no coincide', () => {
    const r = restablecerSchema.safeParse({ password: '12345678', confirmar: 'distinta1' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['confirmar'])
    }
  })
})
