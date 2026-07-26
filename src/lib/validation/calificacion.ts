import { z } from 'zod'

export const calificacionSchema = z.object({
  estrellas: z.coerce.number().int()
    .min(1, 'Debe seleccionar entre 1 y 5 estrellas.')
    .max(5, 'Debe seleccionar entre 1 y 5 estrellas.'),
  comentario: z.string().max(500, 'El comentario no puede superar 500 caracteres.').optional(),
})

export type CalificacionInput = z.infer<typeof calificacionSchema>
