import { describe, it, expect, vi, afterEach } from 'vitest'
import * as resendCliente from '@/lib/resend/cliente'
import { notificarNuevaIntencion } from '@/lib/notificaciones/intencion'

describe('notificarNuevaIntencion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envía el correo al dueño de la oferta con los datos de contacto', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarNuevaIntencion({
      correoDueno: 'dueno@empresa.com',
      empresaRespondio: 'Nutifinanzas S.A.S',
      contactoRespondio: 'Jaime Calle',
      celularRespondio: '3113472345',
      correoRespondio: 'jaime@nutifinanzas.com',
      tipo: 'aceptar_precio',
      comentarios: 'Podemos hacerlo hoy mismo',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dueno@empresa.com',
        subject: expect.stringContaining('Nueva intención'),
      })
    )
    const html = spy.mock.calls[0][0].html
    expect(html).toContain('Nutifinanzas S.A.S')
    expect(html).toContain('Jaime Calle')
    expect(html).toContain('3113472345')
    expect(html).toContain('jaime@nutifinanzas.com')
    expect(html).toContain('Podemos hacerlo hoy mismo')
  })

  it('no revienta si enviarCorreo falla (best-effort, ya lo maneja el cliente)', async () => {
    vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)
    await expect(notificarNuevaIntencion({
      correoDueno: 'x@y.com', empresaRespondio: 'X', contactoRespondio: 'Y',
      celularRespondio: '300', correoRespondio: 'y@z.com',
      tipo: 'solicitar_contacto', comentarios: null,
    })).resolves.toBeUndefined()
  })

  it('escapa HTML en comentarios para evitar inyección en el correo', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarNuevaIntencion({
      correoDueno: 'dueno@empresa.com',
      empresaRespondio: 'Nutifinanzas S.A.S',
      contactoRespondio: 'Jaime Calle',
      celularRespondio: '3113472345',
      correoRespondio: 'jaime@nutifinanzas.com',
      tipo: 'aceptar_precio',
      comentarios: '<script>alert(1)</script>',
    })

    const html = spy.mock.calls[0][0].html
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
