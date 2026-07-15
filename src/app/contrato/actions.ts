'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { CONTRATO_VERSION, TRATAMIENTO_VERSION } from '@/lib/legal/contrato'

export type ContratoState = { error: string | null }

/**
 * IP del cliente para el ledger de aceptaciones. `x-real-ip` la fija el borde
 * de Vercel y el cliente no puede sobrescribirla — se prefiere. Si falta, se
 * usa `x-forwarded-for`, pero tomando el ÚLTIMO valor: un cliente puede
 * anteponer cualquier IP falsa a esa cabecera, pero Vercel siempre AGREGA la
 * IP real de conexión al final de la cadena, así que el primer valor no es
 * confiable para trazabilidad legal.
 */
function capturarIp(headerList: Awaited<ReturnType<typeof headers>>): string | null {
  const real = headerList.get('x-real-ip')?.trim()
  if (real) return real

  const forwarded = headerList.get('x-forwarded-for')
  if (!forwarded) return null
  const partes = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
  return partes.at(-1) ?? null
}

export async function aceptarTerminos(
  _prev: ContratoState,
  formData: FormData
): Promise<ContratoState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('estado')
    .eq('id', user.id)
    .single()

  if (perfil?.estado !== 'aprobado') {
    return { error: 'Solo puede aceptar el contrato una vez su empresa esté aprobada.' }
  }

  const aceptaContrato = formData.get('contrato') === 'on'
  const aceptaDatos = formData.get('datos') === 'on'
  if (!aceptaContrato || !aceptaDatos) {
    return { error: 'Debe aceptar el contrato de servicios y la autorización de tratamiento de datos.' }
  }

  // Idempotencia: si ya aceptó la versión vigente de alguno, no duplicar esa fila.
  const { data: existentes } = await supabase
    .from('aceptaciones')
    .select('documento, version')
    .eq('usuario_id', user.id)
    .in('documento', ['contrato_servicios', 'tratamiento_datos'])

  const yaAceptoContrato = existentes?.some(
    (a) => a.documento === 'contrato_servicios' && a.version === CONTRATO_VERSION
  )
  const yaAceptoDatos = existentes?.some(
    (a) => a.documento === 'tratamiento_datos' && a.version === TRATAMIENTO_VERSION
  )

  const headerList = await headers()
  const ip = capturarIp(headerList)
  const userAgent = headerList.get('user-agent')

  const filas: Array<{
    usuario_id: string
    documento: 'contrato_servicios' | 'tratamiento_datos'
    version: string
    ip: string | null
    user_agent: string | null
  }> = []
  if (!yaAceptoContrato) {
    filas.push({ usuario_id: user.id, documento: 'contrato_servicios', version: CONTRATO_VERSION, ip, user_agent: userAgent })
  }
  if (!yaAceptoDatos) {
    filas.push({ usuario_id: user.id, documento: 'tratamiento_datos', version: TRATAMIENTO_VERSION, ip, user_agent: userAgent })
  }

  if (filas.length > 0) {
    const { error } = await supabase.from('aceptaciones').insert(filas)
    if (error) return { error: 'No se pudo registrar la aceptación. Intente de nuevo.' }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
