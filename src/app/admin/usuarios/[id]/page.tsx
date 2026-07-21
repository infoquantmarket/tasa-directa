import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EstadoBadge } from '@/components/estado-badge'
import { ETIQUETAS_DOCUMENTO, TODOS_TIPOS_DOCUMENTO, puedeAprobarUsuario } from '@/lib/validation/kyc'
import { revisarDocumento, aprobarUsuario, rechazarUsuario } from '../../actions'
import { GestionComercial } from './gestion-comercial'
import { PerfilEmpresa } from './perfil-empresa'
import { DOCUMENTOS_LEGALES, VERSION_LEGAL } from '@/lib/legal/documentos'

export const metadata: Metadata = { title: 'Expediente PCD' }

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: movimientos }, { data: aceptaciones }, { data: verificacionIdentidad }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', id),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', id).maybeSingle(),
    supabase.from('token_movimientos')
      .select('id, delta, concepto, nota, created_at')
      .eq('usuario_id', id).order('created_at', { ascending: false }).limit(5),
    supabase.from('aceptaciones').select('documento, version, ip, created_at')
      .eq('usuario_id', id),
    supabase.from('validaciones_identidad').select('estado, created_at')
      .eq('usuario_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!perfil) notFound()

  const aceptadoPorSlug = new Map(
    (aceptaciones ?? [])
      .filter((a) => a.version === VERSION_LEGAL)
      .map((a) => [a.documento, a])
  )

  const urls: Record<string, string | null> = {}
  for (const doc of docs ?? []) {
    const { data } = await supabase.storage
      .from('kyc-documentos')
      .createSignedUrl(doc.storage_path, 600)
    urls[doc.id] = data?.signedUrl ?? null
  }

  const listo = puedeAprobarUsuario(
    (docs ?? []).map((d) => ({ tipo_documento: d.tipo_documento, estado: d.estado })),
    verificacionIdentidad
  )

  const revisarBound = revisarDocumento.bind(null, { error: null })
  const aprobarBound = aprobarUsuario.bind(null, { error: null })
  const rechazarBound = rechazarUsuario.bind(null, { error: null })

  const revisarAction = async (formData: FormData) => {
    'use server'
    await revisarBound(formData)
  }
  const aprobarAction = async (formData: FormData) => {
    'use server'
    await aprobarBound(formData)
  }
  const rechazarAction = async (formData: FormData) => {
    'use server'
    await rechazarBound(formData)
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/admin" />}>
          ← Volver
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">{perfil.razon_social}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              NIT {perfil.nit ?? '—'} · {perfil.sede ?? '—'} · {perfil.ciudad ?? '—'}
            </p>
            <p className="text-sm text-muted-foreground">
              {perfil.correo} · Tel {perfil.telefono ?? '—'} · WhatsApp {perfil.whatsapp ?? '—'}
            </p>
          </div>
          <EstadoBadge estado={perfil.estado} />
        </CardHeader>
      </Card>

      <PerfilEmpresa perfil={perfil} />

      <section className="grid gap-1 rounded-lg border border-border bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold">Documentos legales</h2>
        <ul className="grid gap-1 text-sm">
          {DOCUMENTOS_LEGALES.map((d) => {
            const a = aceptadoPorSlug.get(d.slug)
            return (
              <li key={d.slug} className="flex items-center justify-between gap-4">
                <span>{d.titulo}</span>
                <span className="text-muted-foreground">
                  {a
                    ? `Aceptado ${new Date(a.created_at).toLocaleDateString('es-CO')} · IP ${a.ip ?? '—'}`
                    : 'Pendiente'}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="grid gap-1 rounded-lg border border-border bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold">Verificación de identidad (Didit)</h2>
        <p className="text-sm">
          Representante legal:{' '}
          <span className="text-muted-foreground">
            {verificacionIdentidad
              ? `${verificacionIdentidad.estado} · ${new Date(verificacionIdentidad.created_at).toLocaleDateString('es-CO')}`
              : 'Aún no iniciada'}
          </span>
        </p>
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Documentos</h2>
        {TODOS_TIPOS_DOCUMENTO.map((tipo) => {
          const doc = docs?.find((d) => d.tipo_documento === tipo)
          return (
            <Card key={tipo}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{ETIQUETAS_DOCUMENTO[tipo]}</CardTitle>
                {doc ? <EstadoBadge estado={doc.estado} /> : (
                  <span className="text-sm text-muted-foreground">Sin subir</span>
                )}
              </CardHeader>
              {doc && (
                <CardContent className="grid gap-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{doc.nombre_archivo ?? doc.storage_path}</span>
                    {urls[doc.id] && (
                      <Button variant="outline" size="sm" render={<a href={urls[doc.id]!} target="_blank" rel="noopener noreferrer" />}>
                        Ver documento
                      </Button>
                    )}
                  </div>
                  {doc.notas_revision && (
                    <p className="text-sm text-muted-foreground">Nota previa: {doc.notas_revision}</p>
                  )}
                  {doc.estado === 'pendiente' && (
                    <form action={revisarAction} className="grid gap-3">
                      <input type="hidden" name="docId" value={doc.id} />
                      <Textarea
                        name="nota"
                        placeholder="Nota de revisión (obligatoria al rechazar; ej.: 'RUT ilegible, subir escaneado a color')"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button type="submit" name="decision" value="aprobado" size="sm">
                          Aprobar documento
                        </Button>
                        <Button type="submit" name="decision" value="rechazado" variant="destructive" size="sm">
                          Rechazar documento
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </section>

      {perfil.estado === 'aprobado' && (
        <GestionComercial
          usuarioId={perfil.id}
          membresia={membresia}
          saldo={saldoRow?.saldo ?? 0}
          movimientos={movimientos ?? []}
        />
      )}

      {perfil.estado === 'pendiente' && (
        <section className="grid gap-4 rounded-lg border border-border bg-white p-6">
          <h2 className="text-lg font-semibold">Decisión final</h2>
          <form action={aprobarAction}>
            <input type="hidden" name="usuarioId" value={perfil.id} />
            <Button type="submit" disabled={!listo} size="lg">
              Aprobar PCD
            </Button>
            {!listo && (
              <p className="mt-2 text-sm text-muted-foreground">
                Se habilita cuando los 3 documentos y la verificación de
                identidad del representante legal estén aprobados.
              </p>
            )}
          </form>
          <form action={rechazarAction} className="grid gap-3">
            <input type="hidden" name="usuarioId" value={perfil.id} />
            <Textarea
              name="motivo"
              placeholder="Motivo del rechazo definitivo (visible para el PCD)"
              rows={2}
            />
            <Button type="submit" variant="destructive" className="w-fit">
              Rechazar vinculación
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}
