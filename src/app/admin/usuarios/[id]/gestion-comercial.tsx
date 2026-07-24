import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { esMembresiaVigente, fechaColombiaHoy, type MembresiaResumen } from '@/lib/validation/membresia'
import { ETIQUETAS_CONCEPTO } from '@/lib/validation/tokens'
import { activarMembresia, cancelarMembresia, otorgarTokens } from '../../actions'
import { BotonAccionAdmin } from './boton-accion-admin'
import type { TokenConcepto } from '@/types/database'

interface Movimiento {
  id: string
  delta: number
  concepto: TokenConcepto
  nota: string | null
  created_at: string
}

export function GestionComercial({
  usuarioId,
  membresia,
  saldo,
  movimientos,
}: {
  usuarioId: string
  membresia: MembresiaResumen | null
  saldo: number
  movimientos: Movimiento[]
}) {
  const vigente = esMembresiaVigente(membresia, fechaColombiaHoy())

  const otorgarBound = otorgarTokens.bind(null, { error: null })
  const otorgarAction = async (formData: FormData) => {
    'use server'
    await otorgarBound(formData)
  }

  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold">Gestión comercial</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Membresía</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {vigente ? (
              <>
                <p className="font-medium text-primary">
                  Activa desde {membresia?.fecha_inicio}
                  {membresia?.fecha_fin ? ` · hasta ${membresia.fecha_fin}` : ' · sin vencimiento'}
                </p>
                <BotonAccionAdmin
                  accion={cancelarMembresia}
                  campos={{ usuarioId }}
                  etiqueta="Cancelar membresía"
                  etiquetaCargando="Cancelando…"
                  variante="destructive"
                  confirmar="¿Cancelar la membresía? El PCD perderá el acceso al mercado y sus ofertas activas serán eliminadas."
                />
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Sin membresía activa. Activar tras confirmar el pago (enlace Bold).
                </p>
                <BotonAccionAdmin
                  accion={activarMembresia}
                  campos={{ usuarioId }}
                  etiqueta="Activar membresía"
                  etiquetaCargando="Activando…"
                  confirmar="¿Activar la membresía del PCD?"
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens · saldo: {saldo}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <form action={otorgarAction} className="grid gap-2">
              <input type="hidden" name="usuarioId" value={usuarioId} />
              <Input
                name="cantidad"
                type="number"
                min={1}
                max={100000}
                placeholder="Cantidad de tokens"
                required
              />
              <Textarea
                name="nota"
                rows={1}
                placeholder="Nota (ej. 'Compra pack 50 — pago Bold #123')"
              />
              <Button type="submit" size="sm" className="w-fit">Otorgar tokens</Button>
            </form>
            {movimientos.length > 0 && (
              <ul className="grid gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>{ETIQUETAS_CONCEPTO[m.concepto]}{m.nota ? ` — ${m.nota}` : ''}</span>
                    <span className={m.delta > 0 ? 'text-primary' : 'text-destructive'}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
