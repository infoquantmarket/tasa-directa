import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ContratoForm } from './contrato-form'
import { SLUGS_ETAPA_CONTRATO, VERSION_LEGAL } from '@/lib/legal/documentos'

export const metadata: Metadata = { title: 'Contrato de servicios' }

export default async function ContratoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('estado')
    .eq('id', user.id)
    .single()

  if (perfil?.estado !== 'aprobado') redirect('/dashboard')

  const { data: aceptadas } = await supabase
    .from('aceptaciones')
    .select('documento')
    .eq('usuario_id', user.id)
    .eq('version', VERSION_LEGAL)
    .in('documento', SLUGS_ETAPA_CONTRATO)

  const completas = new Set((aceptadas ?? []).map((a) => a.documento)).size === SLUGS_ETAPA_CONTRATO.length
  if (completas) redirect('/dashboard')

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Contrato de servicios</CardTitle>
            <CardDescription>
              Para activar el acceso al mercado, revise y acepte los siguientes
              documentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContratoForm />
          </CardContent>
        </Card>
      </main>
    </>
  )
}
