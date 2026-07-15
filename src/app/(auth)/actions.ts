'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registroSchema } from '@/lib/validation/registro'
import { notificarTelegram } from '@/lib/telegram/notificar'

export type AuthState = { error: string | null; valores?: Record<string, string> }

function valoresDesdeFormData(formData: FormData): Record<string, string> {
  return {
    correo: String(formData.get('correo') ?? ''),
  }
}

export async function registrarse(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registroSchema.safeParse({
    correo: formData.get('correo'),
    password: formData.get('password'),
    confirmar: formData.get('confirmar'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, valores: valoresDesdeFormData(formData) }
  }

  const { correo, password } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({ email: correo, password })

  if (error) {
    return {
      error: 'No se pudo completar el registro. Verifique el correo o intente más tarde.',
      valores: valoresDesdeFormData(formData),
    }
  }

  await notificarTelegram(`🆕 <b>Nueva cuenta creada</b>\nCorreo: ${correo}`)

  redirect('/registro/confirmar')
}

export async function iniciarSesion(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const correo = String(formData.get('correo') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!correo || !password) return { error: 'Ingrese su correo y contraseña.' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Su correo aún no está confirmado. Revise su bandeja de entrada.' }
    }
    return { error: 'Credenciales incorrectas.' }
  }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', data.user.id)
    .single()

  revalidatePath('/', 'layout')
  redirect(perfil?.rol === 'admin' ? '/admin' : '/dashboard')
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
