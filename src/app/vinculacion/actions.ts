'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { perfilSchema } from '@/lib/validation/perfil'
import { headers } from 'next/headers'
import { capturarIp } from '@/lib/http/ip'
import { SLUG_ETAPA_VINCULACION, VERSION_LEGAL } from '@/lib/legal/documentos'

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

  // ¿Ya aceptó la versión vigente de la autorización de datos?
  const { data: yaAcepto } = await supabase
    .from('aceptaciones')
    .select('id')
    .eq('usuario_id', user.id)
    .eq('documento', SLUG_ETAPA_VINCULACION)
    .eq('version', VERSION_LEGAL)
    .maybeSingle()

  const aceptaDatos = formData.get('autorizacion_datos') === 'on'
  if (!yaAcepto && !aceptaDatos) {
    return {
      error: 'Debe autorizar el tratamiento de datos personales para continuar.',
      valores: valoresDesdeFormData(formData),
    }
  }

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

  if (!yaAcepto) {
    const headerList = await headers()
    await supabase.from('aceptaciones').insert({
      usuario_id: user.id,
      documento: SLUG_ETAPA_VINCULACION,
      version: VERSION_LEGAL,
      ip: capturarIp(headerList),
      user_agent: headerList.get('user-agent'),
      razon_social: d.razonSocial,
      nit: d.nit,
      rep_nombre: d.repNombre,
      rep_num_doc: d.repNumDoc,
    })
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
