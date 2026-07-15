import { z } from 'zod'

const celular = z.string().regex(/^\d{7,10}$/, 'Número inválido (7 a 10 dígitos)')
const celularOpc = celular.or(z.literal('')).optional()

export const TIPOS_SOCIEDAD = [
  { valor: 'sas', etiqueta: 'S.A.S.' },
  { valor: 'sa', etiqueta: 'S.A.' },
  { valor: 'ltda', etiqueta: 'Ltda.' },
  { valor: 'persona_natural', etiqueta: 'Persona natural' },
  { valor: 'otra', etiqueta: 'Otra' },
] as const

export const TIPOS_DOC_REP = ['CC', 'CE', 'Pasaporte', 'NIT'] as const

export const perfilSchema = z.object({
  razonSocial: z.string().min(3, 'Ingrese la razón social registrada ante la DIAN'),
  nombreComercial: z.string().optional(),
  nit: z.string().regex(/^\d{8,10}(-\d)?$/, 'NIT inválido. Formato: 901234567-8'),
  tipoSociedad: z.enum(['sas', 'sa', 'ltda', 'persona_natural', 'otra']),
  sede: z.string().min(2, 'Ingrese el nombre de la sede principal'),
  direccion: z.string().min(5, 'Ingrese la dirección exacta de la sede principal'),
  ciudad: z.string().min(2, 'Seleccione la ciudad'),
  telefono: z.string().regex(/^\d{7,10}$/).or(z.literal('')).optional(),
  sitioWeb: z.string().url('URL inválida').or(z.literal('')).optional(),
  repNombre: z.string().min(3, 'Ingrese el nombre del representante legal'),
  repTipoDoc: z.enum(['CC', 'CE', 'Pasaporte', 'NIT']),
  repNumDoc: z.string().min(5, 'Ingrese el número de documento'),
  repCorreo: z.string().email('Correo del representante inválido'),
  repCelular: celular,
  contactoNombre: z.string().min(3, 'Ingrese el nombre de la persona de contacto'),
  contactoCargo: z.string().optional(),
  contactoCelular: celular,
  contactoCorreo: z.string().email('Correo de contacto inválido'),
  contactoWhatsapp: celularOpc,
})

export type PerfilInput = z.infer<typeof perfilSchema>

/** ¿El perfil de empresa ya fue completado? */
export function perfilCompleto(perfil: { perfil_completo: boolean } | null | undefined): boolean {
  return perfil?.perfil_completo === true
}
