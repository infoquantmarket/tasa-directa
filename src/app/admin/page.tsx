import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EstadoBadge } from '@/components/estado-badge'
import { esMembresiaVigente, fechaColombiaHoy, type MembresiaResumen } from '@/lib/validation/membresia'
import type { EstadoPerfil } from '@/types/database'

export const metadata: Metadata = { title: 'Cumplimiento' }

type FiltroValor = EstadoPerfil | 'activos'

const FILTROS: Array<{ valor: FiltroValor; etiqueta: string }> = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'aprobado', etiqueta: 'Aprobados' },
  { valor: 'activos', etiqueta: 'Activos' },
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
    : 'pendiente') as FiltroValor

  // "Activos" no es un estado propio de perfiles_usuarios: es el subconjunto de
  // Aprobados que además tiene membresía vigente, así que consulta la misma
  // columna 'aprobado' y filtra en memoria con la vigencia de membresía.
  const estadoPerfil: EstadoPerfil = estado === 'activos' ? 'aprobado' : estado
  const muestraMembresia = estadoPerfil === 'aprobado'

  const supabase = await createClient()
  const { data: perfilesBase } = await supabase
    .from('perfiles_usuarios')
    .select('id, razon_social, nit, ciudad, correo, estado, created_at')
    .eq('rol', 'usuario')
    .eq('estado', estadoPerfil)
    .order('created_at', { ascending: true })

  const ids = (perfilesBase ?? []).map((p) => p.id)
  const { data: docs } = ids.length
    ? await supabase
        .from('documentos_kyc')
        .select('usuario_id, estado')
        .in('usuario_id', ids)
    : { data: [] as Array<{ usuario_id: string; estado: string }> }

  const membresiasPorUsuario = new Map<string, MembresiaResumen>()
  if (muestraMembresia && ids.length) {
    const { data: membresias } = await supabase
      .from('membresias')
      .select('usuario_id, estado, fecha_inicio, fecha_fin')
      .in('usuario_id', ids)
      .eq('estado', 'activa')
    for (const m of membresias ?? []) membresiasPorUsuario.set(m.usuario_id, m)
  }

  const hoy = fechaColombiaHoy()
  const esVigente = (usuarioId: string) =>
    esMembresiaVigente(membresiasPorUsuario.get(usuarioId) ?? null, hoy)

  const perfiles = estado === 'activos'
    ? (perfilesBase ?? []).filter((p) => esVigente(p.id))
    : perfilesBase

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
              {muestraMembresia && <TableHead>Membresía</TableHead>}
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
                {muestraMembresia && (
                  <TableCell>
                    {esVigente(p.id) ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                        Activa
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                        Pendiente por activar
                      </Badge>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Button variant="outline" size="sm" render={<Link href={`/admin/usuarios/${p.id}`} />}>
                    Revisar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!perfiles?.length && (
              <TableRow>
                <TableCell colSpan={muestraMembresia ? 7 : 6} className="py-10 text-center text-muted-foreground">
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
