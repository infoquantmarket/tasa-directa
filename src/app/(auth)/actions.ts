'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registroSchema } from '@/lib/validation/registro'
import { notificarTelegram } from '@/lib/telegram/notificar'
import { headers } from 'next/headers'
import { solicitarRecuperacionSchema, restablecerSchema } from '@/lib/validation/recuperar'
import { construirOrigin } from '@/lib/http/origin'

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
  const headerList = await headers()
  const origin = construirOrigin(headerList)

  const { error } = await supabase.auth.signUp({
    email: correo,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  })

  if (error) {
    return {
      error: 'No se pudo completar el registro. Verifique el correo o intente más tarde.',
      valores: valoresDesdeFormData(formData),
    }
  }

  await notificarTelegram(`🆕 <b>Nueva cuenta creada</b>\nCorreo: ${correo}`)

  redirect('/registro/confirmar')
}

async function destinoInicioSesion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<'/admin' | '/dashboard'> {
  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', userId)
    .single()
  return perfil?.rol === 'admin' ? '/admin' : '/dashboard'
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

  const destino = await destinoInicioSesion(supabase, data.user.id)

  revalidatePath('/', 'layout')
  redirect(destino)
}

export async function solicitarRecuperacion(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = solicitarRecuperacionSchema.safeParse({
    correo: formData.get('correo'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, valores: valoresDesdeFormData(formData) }
  }

  const supabase = await createClient()
  const headerList = await headers()
  const origin = construirOrigin(headerList)

  // Se ignora el resultado a propósito: la respuesta al usuario es la misma
  // exista o no la cuenta, para no revelar qué correos están registrados.
  await supabase.auth.resetPasswordForEmail(parsed.data.correo, {
    redirectTo: `${origin}/auth/confirm`,
  })

  redirect('/recuperar/enviado')
}

export type RestablecerState = { error: string | null }

export async function actualizarContrasena(
  _prev: RestablecerState,
  formData: FormData
): Promise<RestablecerState> {
  const parsed = restablecerSchema.safeParse({
    password: formData.get('password'),
    confirmar: formData.get('confirmar'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: 'No se pudo actualizar la contraseña. Intente de nuevo.' }
  }

  const destino = await destinoInicioSesion(supabase, user.id)

  revalidatePath('/', 'layout')
  redirect(destino)
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
