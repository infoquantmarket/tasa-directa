import { z } from 'zod'

export const solicitarRecuperacionSchema = z.object({
  correo: z.string().email('Correo electrónico inválido'),
})

export const restablecerSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  })

export type SolicitarRecuperacionInput = z.infer<typeof solicitarRecuperacionSchema>
export type RestablecerInput = z.infer<typeof restablecerSchema>
