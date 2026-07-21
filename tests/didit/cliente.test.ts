import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { construirDetallesEsperados, crearSesionVerificacion } from '@/lib/didit/cliente'

describe('construirDetallesEsperados', () => {
  it('divide un nombre de dos palabras en first_name y last_name', () => {
    expect(construirDetallesEsperados('Juan Pérez')).toEqual({
      first_name: 'Juan',
      last_name: 'Pérez',
    })
  })

  it('deja last_name vacío si solo hay una palabra', () => {
    expect(construirDetallesEsperados('Juan')).toEqual({
      first_name: 'Juan',
      last_name: '',
    })
  })

  it('junta todo lo que sigue al primer espacio en last_name', () => {
    expect(construirDetallesEsperados('Juan Carlos Pérez Gómez')).toEqual({
      first_name: 'Juan',
      last_name: 'Carlos Pérez Gómez',
    })
  })

  it('recorta espacios sobrantes', () => {
    expect(construirDetallesEsperados('  Juan   Pérez  ')).toEqual({
      first_name: 'Juan',
      last_name: 'Pérez',
    })
  })
})

describe('crearSesionVerificacion', () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env.DIDIT_API_KEY = 'test-api-key'
    process.env.DIDIT_WORKFLOW_ID = 'workflow-123'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...original }
  })

  it('llama a la API de Didit con la URL, headers y body correctos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess_1', url: 'https://verify.didit.me/x' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await crearSesionVerificacion({
      usuarioId: 'user-1',
      repNombre: 'Juan Pérez',
      callback: 'https://tasadirecta.com/vinculacion',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://verification.didit.me/v3/session/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
      })
    )

    const cuerpoEnviado = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(cuerpoEnviado).toEqual({
      workflow_id: 'workflow-123',
      vendor_data: 'user-1',
      callback: 'https://tasadirecta.com/vinculacion',
      expected_details: {
        first_name: 'Juan',
        last_name: 'Pérez',
        id_country: 'CO',
        expected_document_types: ['id_card'],
      },
    })
  })

  it('devuelve sessionId y url de la respuesta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess_42', url: 'https://verify.didit.me/y' }),
    }))

    const resultado = await crearSesionVerificacion({
      usuarioId: 'user-1',
      repNombre: 'Ana Gómez',
      callback: 'https://tasadirecta.com/vinculacion',
    })

    expect(resultado).toEqual({ sessionId: 'sess_42', url: 'https://verify.didit.me/y' })
  })

  it('lanza un error si la respuesta no es exitosa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    }))

    await expect(
      crearSesionVerificacion({
        usuarioId: 'user-1',
        repNombre: 'Ana Gómez',
        callback: 'https://tasadirecta.com/vinculacion',
      })
    ).rejects.toThrow()
  })

  it('lanza un error claro (sin llamar a fetch) si faltan las variables de entorno', async () => {
    delete process.env.DIDIT_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      crearSesionVerificacion({
        usuarioId: 'user-1',
        repNombre: 'Ana Gómez',
        callback: 'https://tasadirecta.com/vinculacion',
      })
    ).rejects.toThrow(/DIDIT_API_KEY/)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
