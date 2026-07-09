import { describe, it, expect } from 'vitest'
import { registroSchema } from '@/lib/validation/registro'

const base = {
  razonSocial: 'Nutifinanzas S.A.S.',
  nit: '901234567-8',
  sede: 'Oviedo',
  ciudad: 'Medellín',
  telefono: '6044442211',
  whatsapp: '3001234567',
  correo: 'contacto@nutifinanzas.co',
  password: 'ClaveSegura123',
}

describe('registroSchema', () => {
  it('acepta un registro válido', () => {
    expect(registroSchema.safeParse(base).success).toBe(true)
  })
  it('acepta NIT sin dígito de verificación', () => {
    expect(registroSchema.safeParse({ ...base, nit: '901234567' }).success).toBe(true)
  })
  it('rechaza NIT con letras', () => {
    expect(registroSchema.safeParse({ ...base, nit: '90123A567' }).success).toBe(false)
  })
  it('rechaza correo inválido', () => {
    expect(registroSchema.safeParse({ ...base, correo: 'no-es-correo' }).success).toBe(false)
  })
  it('rechaza contraseña de menos de 8 caracteres', () => {
    expect(registroSchema.safeParse({ ...base, password: 'corta' }).success).toBe(false)
  })
  it('rechaza razón social vacía', () => {
    expect(registroSchema.safeParse({ ...base, razonSocial: '' }).success).toBe(false)
  })
  it('permite whatsapp vacío (opcional)', () => {
    expect(registroSchema.safeParse({ ...base, whatsapp: '' }).success).toBe(true)
  })
})
