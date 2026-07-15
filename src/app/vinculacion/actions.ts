'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { perfilSchema } from '@/lib/validation/perfil'

export type PerfilState = { error: string | null; valores?: Record<string, string> }

const CAMPOS_FORM = [
  'razonSocial', 'nombreComercial', 'nit', 'tipoSociedad', 'sede', 'direccion', 'ciudad',
  'telefono', 'sitioWeb', 'repNombre', 'repTipoDoc', 'repNumDoc', 'repCorreo', 'repCelular',
  'contactoNombre', 'contactoCargo', 'contactoCelular', 'contactoCorreo', 'contactoWhatsapp',
] as const

function valoresDesdeFormData(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {}
  for (const campo of CAMPOS_FORM) {
    valores[campo] = String(formData.get(campo) ?? '')
  }
  return valores
}

export async function guardarPerfil(
  _prev: PerfilState,
  formData: FormData
): Promise<PerfilState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const crudo = Object.fromEntries(CAMPOS_FORM.map((c) => [c, formData.get(c) ?? '']))
  const parsed = perfilSchema.safeParse(crudo)

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, valores: valoresDesdeFormData(formData) }
  }

  const d = parsed.data

  const { error } = await supabase
    .from('perfiles_usuarios')
    .update({
      razon_social: d.razonSocial,
      nombre_comercial: d.nombreComercial || null,
      nit: d.nit,
      tipo_sociedad: d.tipoSociedad,
      sede: d.sede,
      direccion: d.direccion,
      ciudad: d.ciudad,
      telefono: d.telefono || null,
      sitio_web: d.sitioWeb || null,
      rep_nombre: d.repNombre,
      rep_tipo_doc: d.repTipoDoc,
      rep_num_doc: d.repNumDoc,
      rep_correo: d.repCorreo,
      rep_celular: d.repCelular,
      contacto_nombre: d.contactoNombre,
      contacto_cargo: d.contactoCargo || null,
      contacto_celular: d.contactoCelular,
      contacto_correo: d.contactoCorreo,
      whatsapp: d.contactoWhatsapp || null,
      perfil_completo: true,
    })
    .eq('id', user.id)

  if (error) {
    return { error: 'No se pudo guardar el perfil. Intente de nuevo.', valores: valoresDesdeFormData(formData) }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
