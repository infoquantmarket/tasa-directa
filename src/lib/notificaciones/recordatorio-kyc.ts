import { enviarCorreo } from '@/lib/resend/cliente'

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface NotificarRecordatorioKycInput {
  correo: string
  razonSocial: string
}

export async function notificarRecordatorioKyc(input: NotificarRecordatorioKycInput): Promise<void> {
  const razonSocial = escapeHtml(input.razonSocial)

  const html = `
    <h2>Complete su vinculación en Tasa Directa</h2>
    <p>Hola, equipo de <strong>${razonSocial}</strong>.</p>
    <p>Notamos que aún no ha cargado su documentación (RUT, Cámara de Comercio y Resolución DIAN) en Tasa Directa. Sin estos documentos no podemos aprobar su cuenta, y no podrá conectar con otros Profesionales de Cambio, publicar ofertas ni responder a las de sus colegas.</p>
    <p><a href="https://www.tasadirecta.com/vinculacion">Complete su vinculación aquí</a></p>
  `

  await enviarCorreo({
    to: input.correo,
    subject: 'Complete su vinculación en Tasa Directa',
    html,
  })
}
