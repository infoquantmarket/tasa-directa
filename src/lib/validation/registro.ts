import { z } from 'zod'

export const registroSchema = z
  .object({
    correo: z.string().email('Correo electrónico inválido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  })

export type RegistroInput = z.infer<typeof registroSchema>
