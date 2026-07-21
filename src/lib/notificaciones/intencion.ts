import { enviarCorreo } from '@/lib/resend/cliente'
import type { TipoIntencion } from '@/types/database'

export interface NotificarNuevaIntencionInput {
  correoDueno: string
  empresaRespondio: string
  contactoRespondio: string
  celularRespondio: string
  correoRespondio: string
  tipo: TipoIntencion
  comentarios: string | null
}

const ETIQUETA_TIPO: Record<TipoIntencion, string> = {
  aceptar_precio: 'Acepta el precio publicado',
  solicitar_contacto: 'Solicita contacto para negociar',
}

/**
 * Escapa caracteres HTML especiales antes de interpolar texto libre
 * (comentarios del PCD, campos de perfil de empresa) dentro del `html` del
 * correo. Estos valores son texto libre sin restricciones — sin esto, un PCD
 * podría inyectar HTML/JS en el cuerpo del correo (ej. escribiendo
 * `<img src=x onerror=...>` como comentario).
 */
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function notificarNuevaIntencion(input: NotificarNuevaIntencionInput): Promise<void> {
  const empresaRespondio = escapeHtml(input.empresaRespondio)
  const contactoRespondio = escapeHtml(input.contactoRespondio)
  const celularRespondio = escapeHtml(input.celularRespondio)
  const correoRespondio = escapeHtml(input.correoRespondio)
  const comentarios = input.comentarios ? escapeHtml(input.comentarios) : null

  const html = `
    <h2>Nueva intención sobre su oferta</h2>
    <p><strong>${empresaRespondio}</strong> respondió a su publicación en Tasa Directa.</p>
    <p><strong>Tipo:</strong> ${ETIQUETA_TIPO[input.tipo]}</p>
    ${comentarios ? `<p><strong>Comentarios:</strong> ${comentarios}</p>` : ''}
    <h3>Datos de contacto</h3>
    <p>${contactoRespondio}<br/>
    Celular: ${celularRespondio}<br/>
    Correo: ${correoRespondio}</p>
    <p>Entre a Tasa Directa para ver el detalle y decidir si continúa la negociación.</p>
  `

  await enviarCorreo({
    to: input.correoDueno,
    subject: 'Nueva intención sobre su oferta — Tasa Directa',
    html,
  })
}
