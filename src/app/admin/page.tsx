import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/estado-badge'
import type { EstadoPerfil } from '@/types/database'

export const metadata: Metadata = { title: 'Cumplimiento' }

const FILTROS: Array<{ valor: EstadoPerfil; etiqueta: string }> = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'aprobado', etiqueta: 'Aprobados' },
  { valor: 'rechazado', etiqueta: 'Rechazados' },
  { valor: 'suspendido', etiqueta: 'Suspendidos' },
]

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  const { estado: estadoParam } = await searchParams
  const estado = (FILTROS.some((f) => f.valor === estadoParam)
    ? estadoParam
    : 'pendiente') as EstadoPerfil

  const supabase = await createClient()
  const { data: perfiles } = await supabase
    .from('perfiles_usuarios')
    .select('id, razon_social, nit, ciudad, correo, estado, created_at')
    .eq('rol', 'usuario')
    .eq('estado', estado)
    .order('created_at', { ascending: true })

  const ids = (perfiles ?? []).map((p) => p.id)
  const { data: docs } = ids.length
    ? await supabase
        .from('documentos_kyc')
        .select('usuario_id, estado')
        .in('usuario_id', ids)
    : { data: [] as Array<{ usuario_id: string; estado: string }> }

  const resumenDocs = (usuarioId: string) => {
    const propios = (docs ?? []).filter((d) => d.usuario_id === usuarioId)
    const aprobados = propios.filter((d) => d.estado === 'aprobado').length
    return `${aprobados}/3 aprobados · ${propios.length}/3 subidos`
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de Cumplimiento</h1>
        <p className="text-sm text-muted-foreground">
          Revisión y aprobación de Profesionales de Compra y Venta de Divisas.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {FILTROS.map((f) => (
            <Button
              key={f.valor}
              variant={f.valor === estado ? 'default' : 'outline'}
              size="sm"
              render={<Link href={`/admin?estado=${f.valor}`} />}
            >
              {f.etiqueta}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" render={<Link href="/admin/operaciones" />}>
          Operaciones
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>NIT</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Documentos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(perfiles ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.razon_social}</div>
                  <div className="text-xs text-muted-foreground">{p.correo}</div>
                </TableCell>
                <TableCell>{p.nit ?? '—'}</TableCell>
                <TableCell>{p.ciudad ?? '—'}</TableCell>
                <TableCell className="text-sm">{resumenDocs(p.id)}</TableCell>
                <TableCell><EstadoBadge estado={p.estado} /></TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" render={<Link href={`/admin/usuarios/${p.id}`} />}>
                    Revisar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!perfiles?.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No hay PCD en este estado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
