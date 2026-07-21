import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'
import { eliminarOferta } from '@/app/ofertas/actions'
import { BotonAccionOferta } from '@/app/ofertas/mis-ofertas/boton-accion-oferta'

export const metadata: Metadata = { title: 'Operaciones' }

export default async function OperacionesPage() {
  const supabase = await createClient()

  const { data: ofertas } = await supabase
    .from('ofertas')
    .select('id, empresa, operacion, moneda, cantidad, precio_cop, estado, expira_en, usuario_id')
    .in('estado', ['activa', 'en_negociacion'])
    .order('created_at', { ascending: false })

  const ids = (ofertas ?? []).map((o) => o.id)
  const { data: intenciones } = ids.length
    ? await supabase.from('intenciones').select('oferta_id, estado').in('oferta_id', ids)
    : { data: [] }

  const conteoIntenciones = (ofertaId: string) =>
    (intenciones ?? []).filter((i) => i.oferta_id === ofertaId && i.estado !== 'cerrada').length

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/admin" />}>← Volver</Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operaciones</h1>
        <p className="text-sm text-muted-foreground">Ofertas activas y en negociación en toda la plataforma.</p>
      </div>

      <div className="rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Operación</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Intenciones</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ofertas ?? []).map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.empresa}</TableCell>
                <TableCell>{o.operacion === 'venta' ? 'Vende' : 'Compra'} {o.moneda}</TableCell>
                <TableCell>{o.cantidad.toLocaleString('es-CO')}</TableCell>
                <TableCell>${o.precio_cop.toLocaleString('es-CO')}</TableCell>
                <TableCell>{o.estado === 'en_negociacion' ? 'En negociación' : 'Activa'}</TableCell>
                <TableCell className="text-xs">{formatearCuentaRegresiva(o.expira_en)}</TableCell>
                <TableCell>{conteoIntenciones(o.id)}</TableCell>
                <TableCell>
                  <BotonAccionOferta
                    accion={eliminarOferta}
                    campoNombre="ofertaId"
                    campoValor={o.id}
                    etiqueta="Eliminar"
                    etiquetaCargando="Eliminando…"
                    variante="destructive"
                  />
                </TableCell>
              </TableRow>
            ))}
            {!ofertas?.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No hay ofertas activas ni en negociación.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
