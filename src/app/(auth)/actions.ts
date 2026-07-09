'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registroSchema } from '@/lib/validation/registro'

export type AuthState = { error: string | null }

export async function registrarse(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registroSchema.safeParse({
    razonSocial: formData.get('razonSocial'),
    nit: formData.get('nit'),
    sede: formData.get('sede'),
    ciudad: formData.get('ciudad'),
    telefono: formData.get('telefono') ?? '',
    whatsapp: formData.get('whatsapp') ?? '',
    correo: formData.get('correo'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { correo, password, razonSocial, nit, sede, ciudad, telefono, whatsapp } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: correo,
    password,
    options: {
      data: {
        razon_social: razonSocial,
        nit,
        sede,
        ciudad,
        telefono: telefono || null,
        whatsapp: whatsapp || null,
      },
    },
  })

  if (error) {
    return { error: 'No se pudo completar el registro. Verifique el correo o intente más tarde.' }
  }

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
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password })

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Su correo aún no está confirmado. Revise su bandeja de entrada.' }
    }
    return { error: 'Credenciales incorrectas.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
