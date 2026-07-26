'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { calificacionSchema } from '@/lib/validation/calificacion'
import { mensajeDesdeError } from '@/lib/ofertas/mensaje-error'
import type { AccionState } from './actions'

export async function calificarContraparte(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  const parsed = calificacionSchema.safeParse({
    estrellas: formData.get('estrellas'),
    comentario: formData.get('comentario'),
  })

  if (!ofertaId) return { error: 'Solicitud inválida.' }
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('calificar_contraparte', {
    p_oferta_id: ofertaId,
    p_estrellas: parsed.data.estrellas,
    p_comentario: parsed.data.comentario || undefined,
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ya calificó este trato.' }
    return { error: mensajeDesdeError(error) }
  }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}
