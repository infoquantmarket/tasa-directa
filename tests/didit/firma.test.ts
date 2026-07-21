import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { canonicalizarJson, verificarFirmaWebhook } from '@/lib/didit/firma'

describe('canonicalizarJson', () => {
  it('ordena las claves de un objeto simple', () => {
    expect(canonicalizarJson('{"b":1,"a":2}')).toBe('{"a":2,"b":1}')
  })

  it('ordena las claves recursivamente, en todos los niveles', () => {
    const entrada = '{"b":{"z":1,"a":2},"a":3}'
    expect(canonicalizarJson(entrada)).toBe('{"a":3,"b":{"a":2,"z":1}}')
  })

  it('mantiene el orden de los elementos dentro de arrays', () => {
    const entrada = '{"a":[{"b":2,"a":1},{"d":4,"c":3}]}'
    expect(canonicalizarJson(entrada)).toBe('{"a":[{"a":1,"b":2},{"c":3,"d":4}]}')
  })

  it('preserva caracteres unicode sin escaparlos', () => {
    expect(canonicalizarJson('{"nombre":"José"}')).toBe('{"nombre":"José"}')
  })

  it('produce el mismo resultado sin importar el orden de entrada', () => {
    const a = canonicalizarJson('{"session_id":"abc","status":"Approved"}')
    const b = canonicalizarJson('{"status":"Approved","session_id":"abc"}')
    expect(a).toBe(b)
  })
})

describe('verificarFirmaWebhook', () => {
  const secreto = 'secreto-de-prueba'
  const cuerpoRaw = '{"status":"Approved","session_id":"abc123"}'
  const canonico = canonicalizarJson(cuerpoRaw)
  const firmaValida = createHmac('sha256', secreto).update(canonico).digest('hex')
  const ahora = 1_700_000_000

  it('acepta una firma válida dentro de la ventana de tiempo', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora,
    })
    expect(resultado).toBe(true)
  })

  it('rechaza una firma incorrecta', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: 'firma-incorrecta',
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora,
    })
    expect(resultado).toBe(false)
  })

  it('rechaza si el timestamp está fuera de la ventana de 300 segundos', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora + 301,
    })
    expect(resultado).toBe(false)
  })

  it('acepta justo en el límite de 300 segundos', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora + 300,
    })
    expect(resultado).toBe(true)
  })

  it('rechaza si el secreto no coincide', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto: 'otro-secreto',
      ahoraSegundos: ahora,
    })
    expect(resultado).toBe(false)
  })
})
