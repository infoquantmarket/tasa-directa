import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ContratoForm } from './contrato-form'
import { CONTRATO_VERSION } from '@/lib/legal/contrato'

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

  const { data: aceptacion } = await supabase
    .from('aceptaciones')
    .select('id')
    .eq('usuario_id', user.id)
    .eq('documento', 'contrato_servicios')
    .eq('version', CONTRATO_VERSION)
    .maybeSingle()

  if (aceptacion) redirect('/dashboard')

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Contrato de servicios</CardTitle>
            <CardDescription>
              Para activar el acceso al mercado, revise y acepte el contrato de
              prestación de servicios y la autorización de tratamiento de datos.
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
