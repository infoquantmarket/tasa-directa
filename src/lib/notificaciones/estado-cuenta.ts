import { enviarCorreo } from '@/lib/resend/cliente'

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function notificarSuspension(input: { correo: string; razonSocial: string; motivo: string }): Promise<void> {
  const razonSocial = escapeHtml(input.razonSocial)
  const motivo = escapeHtml(input.motivo)

  const html = `
    <h2>Su cuenta ha sido suspendida</h2>
    <p>La cuenta de <strong>${razonSocial}</strong> en Tasa Directa fue suspendida por nuestro equipo de cumplimiento.</p>
    <p><strong>Motivo:</strong> ${motivo}</p>
    <p>Mientras dure la suspensión no podrá publicar ni responder ofertas en el mercado. Su membresía se conserva: si la suspensión se levanta, recuperará el acceso sin necesidad de un nuevo pago.</p>
    <p>Si considera que esto es un error, contacte a soporte.</p>
  `

  await enviarCorreo({
    to: input.correo,
    subject: 'Su cuenta ha sido suspendida — Tasa Directa',
    html,
  })
}

export async function notificarReactivacion(input: { correo: string; razonSocial: string; membresiaVigente: boolean }): Promise<void> {
  const razonSocial = escapeHtml(input.razonSocial)

  const html = `
    <h2>Su cuenta fue reactivada</h2>
    <p>La cuenta de <strong>${razonSocial}</strong> en Tasa Directa ha sido reactivada por nuestro equipo de cumplimiento.</p>
    ${input.membresiaVigente
      ? '<p>Su membresía seguía vigente, así que ya tiene acceso completo al mercado nuevamente.</p>'
      : '<p>Su membresía no está activa actualmente. Para volver a publicar y responder ofertas, será necesario activarla.</p>'
    }
  `

  await enviarCorreo({
    to: input.correo,
    subject: 'Su cuenta fue reactivada — Tasa Directa',
    html,
  })
}
