import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { esMembresiaVigente, fechaColombiaHoy } from '@/lib/validation/membresia'
import { TarjetaOferta } from './tarjeta-oferta'
import { ModalRealizarOferta } from './modal-realizar-oferta'

export const metadata: Metadata = { title: 'Tablero de ofertas' }

export default async function OfertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: perfil }, { data: membresia }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('estado').eq('id', user.id).single(),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
  ])

  if (!perfil) redirect('/login')

  const puedeVerMercado = perfil?.estado === 'aprobado' && esMembresiaVigente(membresia, fechaColombiaHoy())

  const { data: ofertas } = puedeVerMercado
    ? await supabase
        .from('ofertas')
        .select('id, empresa, sede, operacion, moneda, cantidad, precio_cop, condiciones, notas, expira_en')
        .eq('estado', 'activa')
        .neq('usuario_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tablero de ofertas</h1>
            <p className="text-sm text-muted-foreground">
              Necesidades de compra/venta de divisas publicadas por otros PCD.
            </p>
          </div>
          <Button variant="outline" render={<Link href="/ofertas/mis-ofertas" />}>
            Mis ofertas
          </Button>
        </div>

        {!puedeVerMercado ? (
          <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground">
            {perfil?.estado !== 'aprobado'
              ? 'Su empresa debe estar aprobada para ver y participar en el mercado.'
              : 'Necesita una membresía activa para ver y participar en el mercado.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(ofertas ?? []).map((o) => (
              <TarjetaOferta
                key={o.id}
                oferta={{
                  id: o.id,
                  empresa: o.empresa,
                  sede: o.sede,
                  operacion: o.operacion,
                  moneda: o.moneda,
                  cantidad: o.cantidad,
                  precioCop: o.precio_cop,
                  condiciones: o.condiciones,
                  notas: o.notas,
                  expiraEn: o.expira_en,
                }}
                acciones={<ModalRealizarOferta ofertaId={o.id} />}
              />
            ))}
            {!ofertas?.length && (
              <p className="col-span-full py-10 text-center text-muted-foreground">
                No hay ofertas activas de otras empresas por ahora.
              </p>
            )}
          </div>
        )}
      </main>
    </>
  )
}
