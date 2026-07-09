import { z } from 'zod'

const telefonoOpcional = z
  .string()
  .regex(/^\d{7,10}$/, 'Debe tener entre 7 y 10 dígitos, sin espacios')
  .or(z.literal(''))
  .optional()

export const registroSchema = z.object({
  razonSocial: z.string().min(3, 'Ingrese la razón social registrada ante la DIAN'),
  nit: z.string().regex(/^\d{8,10}(-\d)?$/, 'NIT inválido. Formato: 901234567-8'),
  sede: z.string().min(2, 'Ingrese la sede principal'),
  ciudad: z.string().min(2, 'Ingrese la ciudad'),
  telefono: telefonoOpcional,
  whatsapp: telefonoOpcional,
  correo: z.string().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

export type RegistroInput = z.infer<typeof registroSchema>
