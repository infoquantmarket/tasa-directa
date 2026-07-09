import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EstadoBadge } from '@/components/estado-badge'
import { DocumentoUploader } from './documento-uploader'
import {
  TIPOS_DOCUMENTO,
  ETIQUETAS_DOCUMENTO,
  DESCRIPCIONES_DOCUMENTO,
} from '@/lib/validation/kyc'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: perfil }, { data: docs }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', user.id),
  ])

  if (!perfil) redirect('/login')

  const documentos = TIPOS_DOCUMENTO.map((tipo) => ({
    tipo,
    doc: docs?.find((d) => d.tipo_documento === tipo) ?? null,
  }))

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
            Su vinculación fue aprobada. El acceso al mercado se habilita con una
            membresía activa (próximamente).
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Documentos de vinculación</h2>
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
    </div>
  )
}
