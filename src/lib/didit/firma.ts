import { createHmac, timingSafeEqual } from 'crypto'

const VENTANA_SEGUNDOS_MAX = 300

function ordenarClaves(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(ordenarClaves)
  }
  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor as Record<string, unknown>).sort()
    const resultado: Record<string, unknown> = {}
    for (const clave of claves) {
      resultado[clave] = ordenarClaves((valor as Record<string, unknown>)[clave])
    }
    return resultado
  }
  return valor
}

/**
 * Reproduce el "JSON canónico" que exige Didit para X-Signature-V2: claves
 * ordenadas alfabéticamente en todos los niveles, serializado de forma
 * compacta (sin espacios) y con caracteres Unicode sin escapar — que es
 * exactamente lo que hace `JSON.stringify` de JavaScript por defecto.
 */
export function canonicalizarJson(cuerpoRaw: string): string {
  const parsed: unknown = JSON.parse(cuerpoRaw)
  return JSON.stringify(ordenarClaves(parsed))
}

/**
 * Verifica la firma X-Signature-V2 de un webhook de Didit: HMAC-SHA256 sobre
 * el JSON canónico, comparación en tiempo constante, y una ventana de 300
 * segundos de tolerancia sobre X-Timestamp para evitar ataques de repetición.
 */
export function verificarFirmaWebhook(input: {
  cuerpoRaw: string
  firmaV2: string
  timestamp: number
  secreto: string
  ahoraSegundos?: number
}): boolean {
  const ahora = input.ahoraSegundos ?? Math.floor(Date.now() / 1000)
  if (Math.abs(ahora - input.timestamp) > VENTANA_SEGUNDOS_MAX) return false

  const canonico = canonicalizarJson(input.cuerpoRaw)
  const esperada = createHmac('sha256', input.secreto).update(canonico).digest('hex')

  const bufEsperada = Buffer.from(esperada)
  const bufRecibida = Buffer.from(input.firmaV2)
  if (bufEsperada.length !== bufRecibida.length) return false
  return timingSafeEqual(bufEsperada, bufRecibida)
}
