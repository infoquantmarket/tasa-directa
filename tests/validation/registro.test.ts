import { describe, it, expect } from 'vitest'
import { registroSchema } from '@/lib/validation/registro'

const base = {
  correo: 'contacto@nutifinanzas.co',
  password: 'ClaveSegura123',
  confirmar: 'ClaveSegura123',
}

describe('registroSchema', () => {
  it('acepta correo + password (8+) + confirmar igual al password', () => {
    expect(registroSchema.safeParse(base).success).toBe(true)
  })
  it('rechaza cuando password y confirmar no coinciden', () => {
    const result = registroSchema.safeParse({ ...base, confirmar: 'OtraClave123' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['confirmar'])
    }
  })
  it('rechaza contraseña de menos de 8 caracteres', () => {
    expect(registroSchema.safeParse({ ...base, password: 'corta', confirmar: 'corta' }).success).toBe(false)
  })
  it('rechaza correo inválido', () => {
    expect(registroSchema.safeParse({ ...base, correo: 'no-es-correo' }).success).toBe(false)
  })
})
