import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TarjetaOferta } from '../tarjeta-oferta'
import { ModalPublicarOferta } from './modal-publicar-oferta'
import { completarOferta, cerrarNegociacionSinAcuerdo, eliminarOferta, marcarIntencionVista } from '../actions'

export const metadata: Metadata = { title: 'Mis ofertas' }

export default async function MisOfertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membresia } = await supabase
    .from('membresias')
    .select('estado')
    .eq('usuario_id', user.id)
    .eq('estado', 'activa')
    .maybeSingle()

  const { data: todasMisOfertas } = await supabase
    .from('ofertas')
    .select('id, empresa, sede, operacion, moneda, cantidad, precio_cop, condiciones, notas, expira_en, estado, created_at')
    .eq('usuario_id', user.id)
    .order('created_at', { ascending: false })

  const activas = (todasMisOfertas ?? []).filter((o) => o.estado === 'activa' || o.estado === 'en_negociacion')
  const historial = (todasMisOfertas ?? [])
    .filter((o) => o.estado === 'expirada' || o.estado === 'eliminada' || o.estado === 'completada')
    .slice(0, 5)

  const idsActivas = activas.map((o) => o.id)
  const { data: intenciones } = idsActivas.length
    ? await supabase
        .from('intenciones')
        .select('id, oferta_id, tipo, comentarios, estado, usuario_id')
        .in('oferta_id', idsActivas)
    : { data: [] }

  const contactosPorUsuario = new Map<string, {
    razon_social: string; contacto_nombre: string; contacto_celular: string; contacto_correo: string
  }>()
  const idsUsuarios = [...new Set((intenciones ?? []).map((i) => i.usuario_id))]
  if (idsUsuarios.length) {
    const { data: contactos } = await supabase
      .from('perfiles_publicos')
      .select('id, razon_social, contacto_nombre, contacto_celular, contacto_correo')
      .in('id', idsUsuarios)
    for (const c of contactos ?? []) contactosPorUsuario.set(c.id, c)
  }

  const noPuedePublicar = !membresia ? 'Necesita una membresía activa para publicar ofertas.'
    : activas.length >= 5 ? 'Ya tiene 5 ofertas activas. Espere a que una expire, se complete o elimine una.'
    : null

  const completarBound = completarOferta.bind(null, { error: null })
  const cerrarBound = cerrarNegociacionSinAcuerdo.bind(null, { error: null })
  const eliminarBound = eliminarOferta.bind(null, { error: null })
  const marcarVistaBound = marcarIntencionVista.bind(null, { error: null })

  const completarAction = async (formData: FormData) => {
    'use server'
    await completarBound(formData)
  }
  const cerrarAction = async (formData: FormData) => {
    'use server'
    await cerrarBound(formData)
  }
  const eliminarAction = async (formData: FormData) => {
    'use server'
    await eliminarBound(formData)
  }
  const marcarVistaAction = async (formData: FormData) => {
    'use server'
    await marcarVistaBound(formData)
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mis ofertas</h1>
            <p className="text-sm text-muted-foreground">
              {activas.length}/5 activas · próximas gratis: {Math.max(0, 2 - activas.length)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href="/ofertas" />}>Tablero</Button>
            <ModalPublicarOferta deshabilitado={Boolean(noPuedePublicar)} motivo={noPuedePublicar} />
          </div>
        </div>

        <section className="grid gap-4">
          {activas.map((o) => {
            const propias = (intenciones ?? []).filter((i) => i.oferta_id === o.id)
            const nuevas = propias.filter((i) => i.estado === 'enviada').length

            return (
              <TarjetaOferta
                key={o.id}
                oferta={{
                  id: o.id, empresa: o.empresa, sede: o.sede, operacion: o.operacion,
                  moneda: o.moneda, cantidad: o.cantidad, precioCop: o.precio_cop,
                  condiciones: o.condiciones, notas: o.notas, expiraEn: o.expira_en,
                }}
                acciones={
                  <div className="grid gap-3">
                    {o.estado === 'activa' && (
                      <>
                        <form action={eliminarAction}>
                          <input type="hidden" name="ofertaId" value={o.id} />
                          <Button type="submit" variant="outline" size="sm">Eliminar</Button>
                        </form>
                        {propias.length > 0 && (
                          <div className="grid gap-2 rounded-md border border-border p-3">
                            <p className="text-xs font-medium">
                              Intenciones recibidas {nuevas > 0 && <span className="text-primary">({nuevas} nuevas)</span>}
                            </p>
                            {propias.map((i) => {
                              const contacto = contactosPorUsuario.get(i.usuario_id)
                              return (
                                <div key={i.id} className="text-xs text-muted-foreground">
                                  <p>{contacto?.razon_social} · {contacto?.contacto_nombre} · {contacto?.contacto_celular} · {contacto?.contacto_correo}</p>
                                  {i.comentarios && <p>&ldquo;{i.comentarios}&rdquo;</p>}
                                  {i.estado === 'enviada' && (
                                    <form action={marcarVistaAction}>
                                      <input type="hidden" name="intencionId" value={i.id} />
                                      <Button type="submit" variant="ghost" size="sm">Marcar como vista</Button>
                                    </form>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                    {o.estado === 'en_negociacion' && (
                      <div className="flex gap-2">
                        <form action={completarAction}>
                          <input type="hidden" name="ofertaId" value={o.id} />
                          <Button type="submit" size="sm">Oferta completada</Button>
                        </form>
                        <form action={cerrarAction}>
                          <input type="hidden" name="ofertaId" value={o.id} />
                          <Button type="submit" variant="outline" size="sm">Republicar</Button>
                        </form>
                      </div>
                    )}
                  </div>
                }
              />
            )
          })}
          {!activas.length && (
            <p className="py-6 text-center text-muted-foreground">No tiene ofertas activas.</p>
          )}
        </section>

        {historial.length > 0 && (
          <section className="mt-8 grid gap-3">
            <h2 className="text-lg font-semibold">Historial reciente</h2>
            {historial.map((o) => (
              <Card key={o.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    {o.operacion === 'venta' ? 'Vende' : 'Compra'} {o.moneda} · {o.cantidad.toLocaleString('es-CO')}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{o.estado}</span>
                </CardHeader>
                <CardContent />
              </Card>
            ))}
          </section>
        )}
      </main>
    </>
  )
}
