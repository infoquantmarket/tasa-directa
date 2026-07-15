import {
  TEXTO_CONTRATO_SERVICIOS,
  TEXTO_TRATAMIENTO_DATOS,
  TEXTO_POLITICA_TRATAMIENTO,
  TEXTO_TERMINOS_CONDICIONES,
  TEXTO_AVISO_PRIVACIDAD,
  TEXTO_POLITICA_KYC,
  TEXTO_POLITICA_REEMBOLSOS,
} from './textos'

export type SlugLegal =
  | 'contrato_servicios'
  | 'tratamiento_datos'
  | 'politica_tratamiento'
  | 'terminos_condiciones'
  | 'aviso_privacidad'
  | 'politica_kyc'
  | 'politica_reembolsos'

export type EtapaAceptacion = 'vinculacion' | 'contrato'

export interface DocumentoLegal {
  slug: SlugLegal
  titulo: string
  subtitulo: string
  version: string
  etapa: EtapaAceptacion
  /** Etiqueta corta de la casilla de aceptación. */
  etiquetaCasilla: string
  texto: string
}

export const VERSION_LEGAL = 'v1-2026-07'

export const DOCUMENTOS_LEGALES: DocumentoLegal[] = [
  {
    slug: 'contrato_servicios',
    titulo: 'Contrato de Prestación de Servicios',
    subtitulo: 'Acceso al marketplace B2B · Plataforma ⟷ PCD',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto el Contrato de Prestación de Servicios.',
    texto: TEXTO_CONTRATO_SERVICIOS,
  },
  {
    slug: 'tratamiento_datos',
    titulo: 'Autorización para el Tratamiento de Datos Personales',
    subtitulo: 'Ley 1581 de 2012',
    version: VERSION_LEGAL,
    etapa: 'vinculacion',
    etiquetaCasilla:
      'Autorizo el tratamiento de mis datos personales conforme a la Política de Tratamiento de Datos.',
    texto: TEXTO_TRATAMIENTO_DATOS,
  },
  {
    slug: 'politica_tratamiento',
    titulo: 'Política de Tratamiento de Datos Personales',
    subtitulo: 'Ley 1581 de 2012 y Decreto 1074 de 2015',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto la Política de Tratamiento de Datos Personales.',
    texto: TEXTO_POLITICA_TRATAMIENTO,
  },
  {
    slug: 'terminos_condiciones',
    titulo: 'Términos y Condiciones de Uso',
    subtitulo: 'Uso de la plataforma Tasa Directa',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto los Términos y Condiciones de Uso.',
    texto: TEXTO_TERMINOS_CONDICIONES,
  },
  {
    slug: 'aviso_privacidad',
    titulo: 'Aviso de Privacidad',
    subtitulo: 'Ley 1581 de 2012',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído el Aviso de Privacidad.',
    texto: TEXTO_AVISO_PRIVACIDAD,
  },
  {
    slug: 'politica_kyc',
    titulo: 'Política de Verificación de Identidad y Vinculación (KYC)',
    subtitulo: 'Qué se solicita, para qué y su alcance',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto la Política de Verificación de Identidad (KYC).',
    texto: TEXTO_POLITICA_KYC,
  },
  {
    slug: 'politica_reembolsos',
    titulo: 'Política de Reembolsos',
    subtitulo: 'Suscripción estándar y billetera de tokens',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto la Política de Reembolsos.',
    texto: TEXTO_POLITICA_REEMBOLSOS,
  },
]

export const SLUGS_LEGALES = DOCUMENTOS_LEGALES.map((d) => d.slug)

export const documentosPorEtapa = (etapa: EtapaAceptacion): DocumentoLegal[] =>
  DOCUMENTOS_LEGALES.filter((d) => d.etapa === etapa)

export const documentoPorSlug = (slug: string): DocumentoLegal | undefined =>
  DOCUMENTOS_LEGALES.find((d) => d.slug === slug)

/** Los 6 documentos que se aceptan en /contrato (etapa 3). */
export const SLUGS_ETAPA_CONTRATO = documentosPorEtapa('contrato').map((d) => d.slug)

/** El único documento que se acepta en /vinculacion (etapa 2). */
export const SLUG_ETAPA_VINCULACION: SlugLegal = 'tratamiento_datos'
