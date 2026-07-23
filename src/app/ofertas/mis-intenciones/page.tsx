import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BotonAccionOferta } from '../mis-ofertas/boton-accion-oferta'
import { cerrarNegociacionSinAcuerdo } from '../actions'

export const metadata: Metadata = { title: 'Mis intenciones' }

export default async function MisIntencionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: intenciones } = await supabase
    .from('intenciones')
    .select('id, oferta_id, tipo, comentarios, estado, created_at')
    .eq('usuario_id', user.id)
    .order('created_at', { ascending: false })

  const idsOfertas = [...new Set((intenciones ?? []).map((i) => i.oferta_id))]
  const { data: ofertas } = idsOfertas.length
    ? await supabase.from('ofertas').select('id, usuario_id, empresa, operacion, moneda, cantidad, precio_cop, estado').in('id', idsOfertas)
    : { data: [] }
  const ofertaPorId = new Map((ofertas ?? []).map((o) => [o.id, o]))

  // Revelado mutuo: quien respondió también ve el contacto del dueño de la oferta.
  const idsDuenos = [...new Set((ofertas ?? []).map((o) => o.usuario_id))]
  const contactoPorUsuario = new Map<string, {
    contacto_nombre: string; contacto_celular: string; contacto_correo: string
  }>()
  if (idsDuenos.length) {
    const { data: contactos } = await supabase
      .from('perfiles_publicos')
      .select('id, contacto_nombre, contacto_celular, contacto_correo')
      .in('id', idsDuenos)
    for (const c of contactos ?? []) contactoPorUsuario.set(c.id, c)
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Mis intenciones</h1>
          <Button variant="outline" render={<Link href="/ofertas" />}>Tablero</Button>
        </div>

        <section className="grid gap-4">
          {(intenciones ?? []).map((i) => {
            const oferta = ofertaPorId.get(i.oferta_id)
            if (!oferta) return null
            const contacto = contactoPorUsuario.get(oferta.usuario_id)
            const activa = oferta.estado === 'en_negociacion' && i.estado !== 'cerrada'
            return (
              <Card key={i.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {oferta.empresa} — {oferta.operacion === 'venta' ? 'Vende' : 'Compra'} {oferta.moneda}
                  </CardTitle>
                  <CardDescription>
                    {oferta.cantidad.toLocaleString('es-CO')} {oferta.moneda} a ${oferta.precio_cop.toLocaleString('es-CO')} COP
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <p className="text-muted-foreground">Su respuesta: {i.tipo === 'aceptar_precio' ? 'Aceptó el precio' : 'Solicitó contacto'}</p>
                  {i.comentarios && <p className="text-muted-foreground">&ldquo;{i.comentarios}&rdquo;</p>}
                  {activa && contacto && (
                    <div className="grid gap-0.5 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                      <p className="text-sm font-semibold text-primary">Datos de contacto de {oferta.empresa}</p>
                      <p className="text-muted-foreground">
                        {contacto.contacto_nombre} · {contacto.contacto_celular} · {contacto.contacto_correo}
                      </p>
                      <p className="text-muted-foreground">Contáctelos para cerrar la operación por fuera de la plataforma.</p>
                    </div>
                  )}
                  {activa && (
                    <BotonAccionOferta
                      accion={cerrarNegociacionSinAcuerdo}
                      campoNombre="ofertaId"
                      campoValor={oferta.id}
                      etiqueta="No se realizó la negociación"
                      etiquetaCargando="Actualizando…"
                      variante="outline"
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
          {!intenciones?.length && (
            <p className="py-10 text-center text-muted-foreground">Aún no ha respondido ninguna oferta.</p>
          )}
        </section>
      </main>
    </>
  )
}
