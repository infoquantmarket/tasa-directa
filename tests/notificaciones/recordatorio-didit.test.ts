import { describe, it, expect, vi, afterEach } from 'vitest'
import * as resendCliente from '@/lib/resend/cliente'
import { notificarRecordatorioDidit } from '@/lib/notificaciones/recordatorio-didit'

describe('notificarRecordatorioDidit', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envía correo con el nombre de la empresa y el enlace a vinculación', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarRecordatorioDidit({
      correo: 'contacto@empresa.com',
      razonSocial: 'Cambios del Valle S.A.S',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'contacto@empresa.com',
        subject: expect.stringContaining('vinculación'),
      })
    )
    const html = spy.mock.calls[0][0].html
    expect(html).toContain('Cambios del Valle S.A.S')
    expect(html).toContain('https://www.tasadirecta.com/vinculacion')
  })

  it('escapa HTML en la razón social', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarRecordatorioDidit({
      correo: 'x@y.com',
      razonSocial: '<script>evil()</script>',
    })

    const html = spy.mock.calls[0][0].html
    expect(html).not.toContain('<script>evil()</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('usa un saludo genérico cuando razón social es null', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarRecordatorioDidit({
      correo: 'x@y.com',
      razonSocial: null,
    })

    const html = spy.mock.calls[0][0].html
    expect(html).toContain('su empresa')
  })
})
