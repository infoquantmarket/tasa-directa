import { describe, it, expect } from 'vitest'
import { construirOrigin } from '@/lib/http/origin'

const H = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null })

describe('construirOrigin', () => {
  it('usa el host y x-forwarded-proto de la request', () => {
    const origin = construirOrigin(H({ host: 'tasa-directa-abc123.vercel.app', 'x-forwarded-proto': 'https' }))
    expect(origin).toBe('https://tasa-directa-abc123.vercel.app')
  })

  it('usa https por defecto si falta x-forwarded-proto', () => {
    expect(construirOrigin(H({ host: 'localhost:3000' }))).toBe('https://localhost:3000')
  })

  it('cae a www.tasadirecta.com si falta la cabecera host', () => {
    expect(construirOrigin(H({}))).toBe('https://www.tasadirecta.com')
  })
})
