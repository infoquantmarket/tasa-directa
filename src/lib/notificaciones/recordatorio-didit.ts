import { enviarCorreo } from '@/lib/resend/cliente'

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface NotificarRecordatorioDiditInput {
  correo: string
  /** Null cuando el usuario aún no llenó el perfil de su empresa en /vinculacion. */
  razonSocial: string | null
}

export async function notificarRecordatorioDidit(input: NotificarRecordatorioDiditInput): Promise<void> {
  const razonSocial = escapeHtml(input.razonSocial ?? 'su empresa')

  const html = `
    <h2>Solo falta un paso para completar su vinculación</h2>
    <p>Hola, equipo de <strong>${razonSocial}</strong>.</p>
    <p>Sus documentos ya fueron aprobados. Solo falta que el representante legal complete la verificación de identidad (foto y prueba de vida) para terminar el proceso de vinculación en Tasa Directa.</p>
    <p><a href="https://www.tasadirecta.com/vinculacion">Complete la verificación aquí</a></p>
  `

  await enviarCorreo({
    to: input.correo,
    subject: 'Solo falta un paso para completar su vinculación en Tasa Directa',
    html,
  })
}
