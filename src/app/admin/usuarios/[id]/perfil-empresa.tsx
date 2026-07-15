import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TIPOS_SOCIEDAD } from '@/lib/validation/perfil'
import type { Database } from '@/types/database'

type Perfil = Database['public']['Tables']['perfiles_usuarios']['Row']

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{valor || '—'}</dd>
    </div>
  )
}

export function PerfilEmpresa({ perfil }: { perfil: Perfil }) {
  const tipoSociedad = TIPOS_SOCIEDAD.find((t) => t.valor === perfil.tipo_sociedad)?.etiqueta ?? '—'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perfil de la empresa</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3">
          <h4 className="text-sm font-semibold">Empresa</h4>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre comercial" valor={perfil.nombre_comercial} />
            <Campo label="Tipo de sociedad" valor={tipoSociedad} />
            <Campo label="Dirección" valor={perfil.direccion} />
            <Campo label="Sitio web" valor={perfil.sitio_web} />
          </dl>
        </div>
        <div className="grid gap-3">
          <h4 className="text-sm font-semibold">Representante legal</h4>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre" valor={perfil.rep_nombre} />
            <Campo label="Documento" valor={perfil.rep_tipo_doc && perfil.rep_num_doc ? `${perfil.rep_tipo_doc} ${perfil.rep_num_doc}` : null} />
            <Campo label="Correo" valor={perfil.rep_correo} />
            <Campo label="Celular" valor={perfil.rep_celular} />
          </dl>
        </div>
        <div className="grid gap-3">
          <h4 className="text-sm font-semibold">Persona de contacto</h4>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre" valor={perfil.contacto_nombre} />
            <Campo label="Cargo" valor={perfil.contacto_cargo} />
            <Campo label="Correo" valor={perfil.contacto_correo} />
            <Campo label="Celular" valor={perfil.contacto_celular} />
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}
