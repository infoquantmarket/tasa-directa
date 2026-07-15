import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/estado-badge'
import { TIPOS_DOCUMENTO } from '@/lib/validation/kyc'
import { esMembresiaVigente, fechaColombiaHoy } from '@/lib/validation/membresia'
import { Coins, BadgeCheck, FileText } from 'lucide-react'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('tipo_documento, estado').eq('usuario_id', user.id),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', user.id).maybeSingle(),
  ])

  if (!perfil) redirect('/login')

  const membresiaVigente = esMembresiaVigente(membresia, fechaColombiaHoy())
  const saldoTokens = saldoRow?.saldo ?? 0
  const docsAprobados = TIPOS_DOCUMENTO.filter((tipo) =>
    docs?.some((d) => d.tipo_documento === tipo && d.estado === 'aprobado')
  ).length

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{perfil.razon_social}</h1>
          <p className="text-sm text-muted-foreground">NIT {perfil.nit ?? '—'} · {perfil.ciudad ?? ''}</p>
        </div>
        <EstadoBadge estado={perfil.estado} />
      </div>

      {perfil.estado === 'pendiente' && (
        <Alert>
          <AlertTitle>Verificación en proceso</AlertTitle>
          <AlertDescription>
            Suba los 3 documentos requeridos. Nuestro equipo de cumplimiento los
            revisará y le notificaremos la decisión.
          </AlertDescription>
        </Alert>
      )}
      {perfil.estado === 'rechazado' && (
        <Alert variant="destructive">
          <AlertTitle>Vinculación rechazada</AlertTitle>
          <AlertDescription>
            {perfil.motivo_estado ?? 'Contacte a soporte para más información.'}
          </AlertDescription>
        </Alert>
      )}
      {perfil.estado === 'aprobado' && (
        <Alert className="border-green-200 bg-green-50">
          <AlertTitle>Empresa verificada</AlertTitle>
          <AlertDescription>
            Su vinculación fue aprobada. Revise su membresía y saldo de tokens a
            continuación.
          </AlertDescription>
        </Alert>
      )}

      {perfil.estado === 'aprobado' && (
        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Membresía</CardTitle>
              <BadgeCheck className={membresiaVigente ? 'size-5 text-primary' : 'size-5 text-muted-foreground'} />
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {membresiaVigente ? (
                <>
                  <p className="font-medium text-primary">Activa</p>
                  <p className="text-muted-foreground">
                    Acceso total al mercado: publicaciones e intenciones sin límite.
                    {membresia?.fecha_fin ? ` Vigente hasta ${membresia.fecha_fin}.` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Inactiva</p>
                  <p className="text-muted-foreground">
                    Su empresa está verificada. Para activar el acceso al mercado,
                    nuestro equipo le enviará el enlace de pago de la suscripción.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Tokens</CardTitle>
              <Coins className="size-5 text-primary" />
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p className="text-2xl font-bold tracking-tight">{saldoTokens}</p>
              <p className="text-muted-foreground">
                Los tokens le permitirán acceder a servicios como destacar sus
                ofertas o recibir alertas premium (próximamente).
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Perfil y documentos</CardTitle>
          <FileText className="size-5 text-primary" />
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {docsAprobados}/{TIPOS_DOCUMENTO.length} documentos requeridos aprobados.
          </p>
          <Button variant="outline" size="sm" render={<Link href="/vinculacion" />}>
            Ver y editar
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
