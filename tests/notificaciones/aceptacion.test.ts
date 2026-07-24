import { describe, it, expect, vi, afterEach } from 'vitest'
import * as resendCliente from '@/lib/resend/cliente'
import { notificarAceptacion } from '@/lib/notificaciones/aceptacion'

describe('notificarAceptacion', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envía correo al que respondió con los datos del dueño y de la oferta', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarAceptacion({
      correoRespondio: 'quien-oferto@empresa.com',
      empresaDueno: 'Nutifinanzas S.A.S',
      contactoDueno: 'Jaime Calle',
      celularDueno: '3113472345',
      correoDueno: 'jaime@nutifinanzas.com',
      operacionOferta: 'venta',
      monedaOferta: 'USD',
      cantidadOferta: 5000,
      precioOferta: 3300,
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'quien-oferto@empresa.com',
        subject: expect.stringContaining('aceptada'),
      })
    )
    const html = spy.mock.calls[0][0].html
    expect(html).toContain('Nutifinanzas S.A.S')
    expect(html).toContain('Jaime Calle')
    expect(html).toContain('3113472345')
    expect(html).toContain('jaime@nutifinanzas.com')
    expect(html).toContain('Vende')
    expect(html).toContain('USD')
    expect(html).toContain('5.000')
    expect(html).toContain('3.300')
  })

  it('escapa HTML en campos del dueño para evitar inyección', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)
    await notificarAceptacion({
      correoRespondio: 'x@y.com',
      empresaDueno: '<script>evil()</script>',
      contactoDueno: 'Nombre "raro"',
      celularDueno: '300',
      correoDueno: 'z@w.com',
      operacionOferta: 'compra',
      monedaOferta: 'EUR',
      cantidadOferta: 100,
      precioOferta: 4200,
    })
    const html = spy.mock.calls[0][0].html
    expect(html).not.toContain('<script>evil()</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;raro&quot;')
  })
})
