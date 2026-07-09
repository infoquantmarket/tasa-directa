import type { TipoDoc, EstadoDoc } from '@/types/database'

export const TIPOS_DOCUMENTO = ['rut', 'camara_comercio', 'resolucion_dian'] as const

export const ETIQUETAS_DOCUMENTO: Record<TipoDoc, string> = {
  rut: 'RUT',
  camara_comercio: 'Cámara de Comercio',
  resolucion_dian: 'Resolución DIAN',
}

export const DESCRIPCIONES_DOCUMENTO: Record<TipoDoc, string> = {
  rut: 'Registro Único Tributario vigente, expedido por la DIAN.',
  camara_comercio: 'Certificado de existencia y representación legal (no mayor a 30 días).',
  resolucion_dian: 'Resolución de autorización como Profesional de Compra y Venta de Divisas.',
}

export const MAX_TAMANO_BYTES = 10 * 1024 * 1024 // 10 MB — igual al límite del bucket
export const MIME_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'] as const

/** Devuelve null si el archivo es válido, o el mensaje de error para mostrar al PCD. */
export function validarArchivoKyc(mime: string, tamanoBytes: number): string | null {
  if (!MIME_PERMITIDOS.includes(mime as (typeof MIME_PERMITIDOS)[number])) {
    return 'Formato no permitido. Suba el documento en PDF, JPG o PNG.'
  }
  if (tamanoBytes > MAX_TAMANO_BYTES) {
    return 'El archivo supera el máximo de 10 MB.'
  }
  return null
}

/** La aprobación final del PCD solo se habilita con los 3 documentos aprobados. */
export function puedeAprobarUsuario(
  docs: Array<{ tipo_documento: TipoDoc; estado: EstadoDoc }>
): boolean {
  return TIPOS_DOCUMENTO.every((tipo) =>
    docs.some((d) => d.tipo_documento === tipo && d.estado === 'aprobado')
  )
}
