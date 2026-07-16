import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RestablecerForm } from './restablecer-form'

export const metadata: Metadata = { title: 'Poner contraseña nueva' }

export default async function RestablecerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Ponga su contraseña nueva</CardTitle>
            <CardDescription>
              Elija una contraseña nueva para su cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RestablecerForm />
          </CardContent>
        </Card>
      </main>
    </>
  )
}
