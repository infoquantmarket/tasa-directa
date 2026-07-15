import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EstadoBadge } from '@/components/estado-badge'
import { DocumentoUploader } from '@/app/dashboard/documento-uploader'
import { VinculacionForm } from './vinculacion-form'
import {
  TODOS_TIPOS_DOCUMENTO,
  ETIQUETAS_DOCUMENTO,
  DESCRIPCIONES_DOCUMENTO,
} from '@/lib/validation/kyc'
import { Lock } from 'lucide-react'

export const metadata: Metadata = { title: 'Vinculación de la empresa' }

export default async function VinculacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: perfil }, { data: docs }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', user.id),
  ])

  if (!perfil) redirect('/login')

  const valoresIniciales: Record<string, string> = {
    razonSocial: perfil.razon_social ?? '',
    nombreComercial: perfil.nombre_comercial ?? '',
    nit: perfil.nit ?? '',
    tipoSociedad: perfil.tipo_sociedad ?? '',
    sede: perfil.sede ?? '',
    direccion: perfil.direccion ?? '',
    ciudad: perfil.ciudad ?? '',
    telefono: perfil.telefono ?? '',
    sitioWeb: perfil.sitio_web ?? '',
    repNombre: perfil.rep_nombre ?? '',
    repTipoDoc: perfil.rep_tipo_doc ?? '',
    repNumDoc: perfil.rep_num_doc ?? '',
    repCorreo: perfil.rep_correo ?? '',
    repCelular: perfil.rep_celular ?? '',
    contactoNombre: perfil.contacto_nombre ?? '',
    contactoCargo: perfil.contacto_cargo ?? '',
    contactoCelular: perfil.contacto_celular ?? '',
    contactoCorreo: perfil.contacto_correo ?? '',
    contactoWhatsapp: perfil.whatsapp ?? '',
  }

  const documentos = TODOS_TIPOS_DOCUMENTO.map((tipo) => ({
    tipo,
    doc: docs?.find((d) => d.tipo_documento === tipo) ?? null,
  }))

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vinculación de la empresa</h1>
            <p className="text-sm text-muted-foreground">
              Complete el perfil de su empresa y cargue los documentos requeridos.
            </p>
          </div>
          <EstadoBadge estado={perfil.estado} />
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-accent/40 p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            La documentación e información que suministre es <strong>confidencial</strong>.
            Solo se usa para validar la identidad de su empresa y dar seguridad a los
            demás usuarios de la plataforma. No se comparte con terceros.
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">Perfil de la empresa</CardTitle>
            <CardDescription>
              Puede guardar el perfil y subir los documentos en cualquier orden; ambos
              son necesarios para la revisión.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VinculacionForm valoresIniciales={valoresIniciales} />
          </CardContent>
        </Card>

        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">Documentos</h2>
          {documentos.map(({ tipo, doc }) => (
            <Card key={tipo}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{ETIQUETAS_DOCUMENTO[tipo]}</CardTitle>
                  <CardDescription>{DESCRIPCIONES_DOCUMENTO[tipo]}</CardDescription>
                </div>
                {doc && <EstadoBadge estado={doc.estado} />}
              </CardHeader>
              <CardContent className="grid gap-3">
                {doc?.estado === 'rechazado' && doc.notas_revision && (
                  <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Motivo del rechazo: {doc.notas_revision}
                  </p>
                )}
                {doc?.estado === 'aprobado' ? (
                  <p className="text-sm text-muted-foreground">
                    Documento aprobado{doc.nombre_archivo ? `: ${doc.nombre_archivo}` : ''}.
                  </p>
                ) : (
                  <>
                    {doc && (
                      <p className="text-sm text-muted-foreground">
                        Archivo actual: {doc.nombre_archivo ?? doc.storage_path}
                      </p>
                    )}
                    <DocumentoUploader
                      tipo={tipo}
                      usuarioId={user.id}
                      esReemplazo={Boolean(doc)}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </>
  )
}
