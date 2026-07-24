import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { esMembresiaVigente, fechaColombiaHoy } from '@/lib/validation/membresia'
import { TarjetaOferta } from '../tarjeta-oferta'
import { ModalPublicarOferta } from './modal-publicar-oferta'
import { BotonAccionOferta } from './boton-accion-oferta'
import { aceptarIntencion, cerrarNegociacionSinAcuerdo, eliminarOferta, destacarOferta, enviarAlertaCiudad } from '../actions'

export const metadata: Metadata = { title: 'Mis ofertas' }

const ETIQUETA_ESTADO: Record<string, string> = {
  expirada: 'Expirada',
  completada: 'Completada',
  eliminada: 'Eliminada',
}

export default async function MisOfertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: membresia }, { data: perfil }] = await Promise.all([
    supabase.from('membresias')
      .select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
    supabase.from('perfiles_usuarios').select('razon_social').eq('id', user.id).single(),
  ])

  const { data: todasMisOfertas, error: errorOfertas } = await supabase
    .from('ofertas')
    .select('id, empresa, sede, operacion, moneda, cantidad, precio_cop, condiciones, notas, expira_en, estado, destacada, created_at')
    .eq('usuario_id', user.id)
    .order('created_at', { ascending: false })

  // Vigente = 'activa' Y no vencida, o 'en_negociacion'. El cron corre cada
  // hora, así que filtrar por expira_en > ahora acá evita que una oferta
  // vencida (pero aún marcada 'activa') cuente contra el límite ni se muestre
  // como activa (ver también verificar_acceso_oferta en 0011).
  const ahora = new Date().toISOString()
  const activas = (todasMisOfertas ?? []).filter(
    (o) => (o.estado === 'activa' && o.expira_en > ahora) || o.estado === 'en_negociacion'
  )
  const historial = (todasMisOfertas ?? [])
    .filter((o) => (
      o.estado === 'expirada' ||
      o.estado === 'completada' ||
      (o.estado === 'activa' && o.expira_en <= ahora)
    ))
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

  const noPuedePublicar = !esMembresiaVigente(membresia, fechaColombiaHoy()) ? 'Necesita una membresía activa para publicar ofertas.'
    : activas.length >= 5 ? 'Ya tiene 5 ofertas activas. Espere a que una expire, se complete o elimine una.'
    : null

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
            <ModalPublicarOferta
              deshabilitado={Boolean(noPuedePublicar)}
              motivo={noPuedePublicar}
              empresa={perfil?.razon_social ?? ''}
            />
          </div>
        </div>

        {errorOfertas && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>No se pudieron cargar sus ofertas</AlertTitle>
            <AlertDescription>
              Ocurrió un error consultando la base de datos. Intente de nuevo o
              contacte a soporte si persiste. ({errorOfertas.message})
            </AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4">
          {activas.map((o) => {
            const propias = (intenciones ?? []).filter((i) => i.oferta_id === o.id && i.estado !== 'cerrada')
            const nuevas = propias.filter((i) => i.estado === 'enviada').length

            return (
              <TarjetaOferta
                key={o.id}
                oferta={{
                  id: o.id, empresa: o.empresa, sede: o.sede, operacion: o.operacion,
                  moneda: o.moneda, cantidad: o.cantidad, precioCop: o.precio_cop,
                  condiciones: o.condiciones, notas: o.notas, expiraEn: o.expira_en,
                  destacada: o.destacada,
                }}
                acciones={
                  <div className="grid gap-3">
                    <div className="flex flex-wrap gap-2">
                      {!o.destacada && (
                        <BotonAccionOferta
                          accion={destacarOferta}
                          campoNombre="ofertaId"
                          campoValor={o.id}
                          etiqueta="Destacar oferta · 1 token"
                          etiquetaCargando="Destacando…"
                          variante="outline"
                          confirmar="¿Destacar esta oferta por 1 token? Se mostrará arriba del tablero, en la sección Destacadas."
                        />
                      )}
                      {o.estado === 'activa' && (
                        <BotonAccionOferta
                          accion={enviarAlertaCiudad}
                          campoNombre="ofertaId"
                          campoValor={o.id}
                          etiqueta="Enviar alerta a mi ciudad · 1 token"
                          etiquetaCargando="Enviando…"
                          variante="outline"
                          confirmar="¿Enviar un aviso inmediato por Telegram/correo a los PCD aprobados de su zona? Consume 1 token cada vez."
                        />
                      )}
                    </div>

                    {/* Eliminar disponible tanto en 'activa' como en negociación
                        (por si el dueño decide cancelar durante la negociación). */}
                    <BotonAccionOferta
                      accion={eliminarOferta}
                      campoNombre="ofertaId"
                      campoValor={o.id}
                      etiqueta="Eliminar oferta"
                      etiquetaCargando="Eliminando…"
                      variante="outline"
                      confirmar="¿Eliminar esta oferta? No podrá recuperarla."
                    />

                    {propias.length > 0 && (
                      <div className="grid gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                        <p className="text-sm font-semibold text-primary">
                          🤝 Alguien respondió a esta oferta{nuevas > 0 && <span> · {nuevas} nueva{nuevas > 1 ? 's' : ''}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Al aceptar, la oferta queda completada y se envía un correo a quien respondió con sus datos de contacto.
                        </p>
                        {propias.map((i) => {
                          const contacto = contactosPorUsuario.get(i.usuario_id)
                          return (
                            <div key={i.id} className="grid gap-1.5 border-t border-primary/15 pt-2 text-xs">
                              <p className="font-medium text-foreground">{contacto?.razon_social}</p>
                              <p className="text-muted-foreground">
                                {contacto?.contacto_nombre} · {contacto?.contacto_celular} · {contacto?.contacto_correo}
                              </p>
                              <p className="text-muted-foreground">
                                {i.tipo === 'aceptar_precio' ? 'Aceptó el precio publicado' : 'Solicitó contacto para negociar'}
                              </p>
                              {i.comentarios && <p className="text-muted-foreground">&ldquo;{i.comentarios}&rdquo;</p>}
                              {(i.estado === 'enviada' || i.estado === 'vista') && (
                                <BotonAccionOferta
                                  accion={aceptarIntencion}
                                  campoNombre="intencionId"
                                  campoValor={i.id}
                                  etiqueta="Aceptar oferta"
                                  etiquetaCargando="Aceptando…"
                                  confirmar="¿Aceptar esta oferta? La operación quedará cerrada como completada y se notificará por correo a la contraparte."
                                />
                              )}
                              {i.estado === 'aceptada' && (
                                <p className="font-medium text-primary">Oferta aceptada</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {o.estado === 'en_negociacion' && (
                      <BotonAccionOferta
                        accion={cerrarNegociacionSinAcuerdo}
                        campoNombre="ofertaId"
                        campoValor={o.id}
                        etiqueta="Republicar (no se concretó)"
                        etiquetaCargando="Republicando…"
                        variante="outline"
                      />
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
          <details className="mt-8 rounded-lg border border-border bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
              Historial reciente ({historial.length})
            </summary>
            <div className="grid gap-2 border-t border-border p-4">
              {historial.map((o) => {
                const estadoMostrar = o.estado === 'activa' ? 'expirada' : o.estado
                return (
                  <Card key={o.id}>
                    <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                      <CardTitle className="text-sm font-normal text-muted-foreground">
                        {o.operacion === 'venta' ? 'Vende' : 'Compra'} {o.moneda} · {o.cantidad.toLocaleString('es-CO')}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {ETIQUETA_ESTADO[estadoMostrar] ?? estadoMostrar}
                        </span>
                        <BotonAccionOferta
                          accion={eliminarOferta}
                          campoNombre="ofertaId"
                          campoValor={o.id}
                          etiqueta="Quitar"
                          etiquetaCargando="Quitando…"
                          variante="ghost"
                        />
                      </div>
                    </CardHeader>
                    <CardContent />
                  </Card>
                )
              })}
            </div>
          </details>
        )}
      </main>
    </>
  )
}
