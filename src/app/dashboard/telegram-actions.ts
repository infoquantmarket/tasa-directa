'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type AccionState = { error: string | null }

export async function desvincularTelegram(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const vinculacionId = String(formData.get('vinculacionId') ?? '')
  if (!vinculacionId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase.from('telegram_vinculaciones').delete().eq('id', vinculacionId)

  if (error) return { error: 'No se pudo desvincular.' }

  revalidatePath('/dashboard')
  return { error: null }
}
