import { describe, it, expect } from 'vitest'
import { intencionSchema } from '@/lib/validation/intencion'

describe('intencionSchema', () => {
  it('acepta tipo aceptar_precio sin comentarios', () => {
    expect(intencionSchema.safeParse({ tipo: 'aceptar_precio', comentarios: '' }).success).toBe(true)
  })
  it('acepta tipo solicitar_contacto con comentarios', () => {
    expect(intencionSchema.safeParse({
      tipo: 'solicitar_contacto', comentarios: 'Podemos hacerlo mañana en la mañana',
    }).success).toBe(true)
  })
  it('rechaza un tipo no reconocido', () => {
    expect(intencionSchema.safeParse({ tipo: 'regatear', comentarios: '' }).success).toBe(false)
  })
  it('rechaza sin tipo', () => {
    expect(intencionSchema.safeParse({ comentarios: 'hola' }).success).toBe(false)
  })
})
