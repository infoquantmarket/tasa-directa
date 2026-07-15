import { describe, it, expect } from 'vitest'
import { capturarIp } from '@/lib/http/ip'

const H = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null })

describe('capturarIp', () => {
  it('prefiere x-real-ip', () => {
    expect(capturarIp(H({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })
  it('cae al ÚLTIMO segmento de x-forwarded-for (el que agrega Vercel)', () => {
    expect(capturarIp(H({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.9' }))).toBe('203.0.113.9')
  })
  it('devuelve null si no hay cabeceras', () => {
    expect(capturarIp(H({}))).toBeNull()
  })
})
