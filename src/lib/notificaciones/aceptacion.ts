import { enviarCorreo } from '@/lib/resend/cliente'
import type { Moneda, Operacion } from '@/types/database'

export interface NotificarAceptacionInput {
  correoRespondio: string
  empresaDueno: string
  contactoDueno: string
  celularDueno: string
  correoDueno: string
  operacionOferta: Operacion | null
  monedaOferta: Moneda
  cantidadOferta: number
  precioOferta: number
}

/**
 * Escapa caracteres HTML para no permitir inyección desde campos del perfil
 * al interpolar en el cuerpo del correo.
 */
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function notificarAceptacion(input: NotificarAceptacionInput): Promise<void> {
  const empresa = escapeHtml(input.empresaDueno)
  const contacto = escapeHtml(input.contactoDueno)
  const celular = escapeHtml(input.celularDueno)
  const correo = escapeHtml(input.correoDueno)

  const resumenOferta = `${input.operacionOferta === 'venta' ? 'Vende' : 'Compra'} ${input.monedaOferta} ${input.cantidadOferta.toLocaleString('es-CO')} a $${input.precioOferta.toLocaleString('es-CO')} COP`

  const html = `
    <h2>Su intención fue aceptada</h2>
    <p><strong>${empresa}</strong> aceptó su respuesta a la oferta en Tasa Directa.</p>
    <p><strong>Oferta:</strong> ${resumenOferta}</p>
    <h3>Datos de contacto del dueño de la oferta</h3>
    <p>${contacto}<br/>
    Celular: ${celular}<br/>
    Correo: ${correo}</p>
    <p>Contáctenlos directamente para cerrar la operación por fuera de la plataforma.</p>
  `

  await enviarCorreo({
    to: input.correoRespondio,
    subject: 'Su intención fue aceptada — Tasa Directa',
    html,
  })
}
