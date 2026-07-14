import { describe, it, expect } from 'vitest'
import { ETIQUETAS_CONCEPTO, esCredito } from '@/lib/validation/tokens'

describe('tokens', () => {
  it('define etiqueta para los 7 conceptos del ledger', () => {
    expect(Object.keys(ETIQUETAS_CONCEPTO)).toHaveLength(7)
  })
  it('esCredito distingue abonos de consumos', () => {
    expect(esCredito(10)).toBe(true)
    expect(esCredito(-3)).toBe(false)
  })
})
