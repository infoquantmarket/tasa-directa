import { describe, it, expect } from 'vitest'
import { parseTokenInicio, deepLinkVinculacion } from '@/lib/telegram/vinculacion'

describe('parseTokenInicio', () => {
  it('extrae el token de un /start con parámetro', () => {
    expect(parseTokenInicio('/start abc123')).toBe('abc123')
  })
  it('acepta un UUID como token', () => {
    const uuid = '3f8b2c1a-1234-4abc-9def-0123456789ab'
    expect(parseTokenInicio(`/start ${uuid}`)).toBe(uuid)
  })
  it('tolera el sufijo @bot y espacios alrededor', () => {
    expect(parseTokenInicio('  /start@Tasa_Directa_bot tok-EN_1  ')).toBe('tok-EN_1')
  })
  it('devuelve null para /start sin parámetro', () => {
    expect(parseTokenInicio('/start')).toBeNull()
  })
  it('devuelve null para texto que no es /start', () => {
    expect(parseTokenInicio('hola')).toBeNull()
    expect(parseTokenInicio('')).toBeNull()
    expect(parseTokenInicio(null)).toBeNull()
    expect(parseTokenInicio(undefined)).toBeNull()
  })
  it('rechaza tokens con caracteres no permitidos (evita inyección)', () => {
    expect(parseTokenInicio('/start a b')).toBeNull()
    expect(parseTokenInicio('/start <script>')).toBeNull()
  })
  it('rechaza tokens de más de 64 caracteres', () => {
    expect(parseTokenInicio(`/start ${'a'.repeat(65)}`)).toBeNull()
  })
})

describe('deepLinkVinculacion', () => {
  it('arma el deep-link t.me con el token', () => {
    expect(deepLinkVinculacion('abc123')).toBe('https://t.me/Tasa_Directa_bot?start=abc123')
  })
})
