'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { capturarIp } from '@/lib/http/ip'
import { SLUGS_ETAPA_CONTRATO, VERSION_LEGAL } from '@/lib/legal/documentos'

export type ContratoState = { error: string | null }

export async function aceptarTerminos(
  _prev: ContratoState,
  formData: FormData
): Promise<ContratoState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('estado, razon_social, nit, rep_nombre, rep_num_doc')
    .eq('id', user.id)
    .single()

  if (perfil?.estado !== 'aprobado') {
    return { error: 'Solo puede aceptar los documentos una vez su empresa esté aprobada.' }
  }

  // Todas las casillas deben venir marcadas.
  const faltante = SLUGS_ETAPA_CONTRATO.some((slug) => formData.get(slug) !== 'on')
  if (faltante) {
    return { error: 'Debe aceptar todos los documentos para continuar.' }
  }

  // Idempotencia por documento + versión vigente.
  const { data: existentes } = await supabase
    .from('aceptaciones')
    .select('documento')
    .eq('usuario_id', user.id)
    .eq('version', VERSION_LEGAL)
    .in('documento', SLUGS_ETAPA_CONTRATO)

  const yaAceptados = new Set((existentes ?? []).map((a) => a.documento))

  const headerList = await headers()
  const ip = capturarIp(headerList)
  const userAgent = headerList.get('user-agent')

  const filas = SLUGS_ETAPA_CONTRATO.filter((slug) => !yaAceptados.has(slug)).map((slug) => ({
    usuario_id: user.id,
    documento: slug,
    version: VERSION_LEGAL,
    ip,
    user_agent: userAgent,
    razon_social: perfil.razon_social,
    nit: perfil.nit,
    rep_nombre: perfil.rep_nombre,
    rep_num_doc: perfil.rep_num_doc,
  }))

  if (filas.length > 0) {
    const { error } = await supabase.from('aceptaciones').insert(filas)
    if (error) return { error: 'No se pudo registrar la aceptación. Intente de nuevo.' }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
