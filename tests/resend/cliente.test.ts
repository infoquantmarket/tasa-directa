import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { enviarCorreo } from '@/lib/resend/cliente'

describe('enviarCorreo', () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...original }
  })

  it('llama a la API de Resend con la URL, headers y body correctos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'abc' }) })
    vi.stubGlobal('fetch', fetchMock)

    await enviarCorreo({ to: 'jaime@nutifinanzas.com', subject: 'Nueva intención', html: '<p>hola</p>' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    )
    const cuerpo = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(cuerpo).toEqual({
      from: 'Tasa Directa <noreply@tasadirecta.com>',
      to: ['jaime@nutifinanzas.com'],
      subject: 'Nueva intención',
      html: '<p>hola</p>',
    })
  })

  it('no lanza si la respuesta no es exitosa (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve('bad request') }))
    await expect(
      enviarCorreo({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    ).resolves.toBeUndefined()
  })

  it('no lanza si fetch rechaza (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(
      enviarCorreo({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    ).resolves.toBeUndefined()
  })

  it('no llama a fetch si falta RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await enviarCorreo({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
