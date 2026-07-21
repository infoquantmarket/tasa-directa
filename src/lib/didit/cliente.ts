const DIDIT_SESSION_URL = 'https://verification.didit.me/v3/session/'

export interface CrearSesionInput {
  usuarioId: string
  repNombre: string
  callback: string
}

export interface SesionVerificacion {
  sessionId: string
  url: string
}

/**
 * Divide el nombre completo del representante legal en first_name/last_name
 * para el campo `expected_details` de Didit: todo antes del primer espacio
 * es el nombre, el resto es el apellido. Si no hay espacio, el apellido
 * queda vacío — es una aproximación simple, no un análisis de nombres.
 */
export function construirDetallesEsperados(repNombre: string): { first_name: string; last_name: string } {
  const nombre = repNombre.trim().replace(/\s+/g, ' ')
  const espacio = nombre.indexOf(' ')
  if (espacio === -1) return { first_name: nombre, last_name: '' }
  return { first_name: nombre.slice(0, espacio), last_name: nombre.slice(espacio + 1) }
}

/**
 * Crea una sesión de verificación de identidad en Didit para el
 * representante legal. El resultado NO llega en esta llamada — llega
 * después por webhook (ver src/app/api/webhooks/didit/route.ts).
 */
export async function crearSesionVerificacion(input: CrearSesionInput): Promise<SesionVerificacion> {
  const apiKey = process.env.DIDIT_API_KEY
  const workflowId = process.env.DIDIT_WORKFLOW_ID
  if (!apiKey || !workflowId) {
    throw new Error('DIDIT_API_KEY o DIDIT_WORKFLOW_ID no están configurados')
  }

  const { first_name, last_name } = construirDetallesEsperados(input.repNombre)

  const respuesta = await fetch(DIDIT_SESSION_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      vendor_data: input.usuarioId,
      callback: input.callback,
      expected_details: {
        first_name,
        last_name,
        id_country: 'CO',
        expected_document_types: ['id_card'],
      },
    }),
  })

  if (!respuesta.ok) {
    throw new Error(`Didit respondió con estado ${respuesta.status} al crear la sesión`)
  }

  const data = (await respuesta.json()) as { session_id: string; url: string }
  return { sessionId: data.session_id, url: data.url }
}
