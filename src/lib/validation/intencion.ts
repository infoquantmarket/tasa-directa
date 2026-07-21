import { z } from 'zod'

export const intencionSchema = z.object({
  tipo: z.enum(['aceptar_precio', 'solicitar_contacto']),
  comentarios: z.string().optional(),
})

export type IntencionInput = z.infer<typeof intencionSchema>
