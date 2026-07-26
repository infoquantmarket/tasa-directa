import QRCode from 'qrcode'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { deepLinkVinculacion } from '@/lib/telegram/vinculacion'
import { BotonDesvincularTelegram } from './boton-desvincular-telegram'

const TOPE_VINCULACIONES = 3

export interface VinculacionTelegram {
  id: string
  nombreMostrar: string
  createdAt: string
}

export async function TelegramCard({
  vinculaciones,
  token,
}: {
  vinculaciones: VinculacionTelegram[]
  token: string | null | undefined
}) {
  // Resiliencia: si aún no hay token (migración 0010 sin aplicar), no se
  // muestra la tarjeta en vez de renderizar un QR inválido.
  if (!token) return null

  const alcanzoTope = vinculaciones.length >= TOPE_VINCULACIONES
  const enlace = deepLinkVinculacion(token)
  const qrSvg = alcanzoTope ? null : await QRCode.toString(enlace, { type: 'svg', margin: 1, width: 148 })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Avisos por Telegram</CardTitle>
        <Send className="size-5 text-primary" />
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {vinculaciones.length > 0 && (
          <div className="grid gap-2">
            <p className="font-medium text-primary">
              {vinculaciones.length} persona{vinculaciones.length > 1 ? 's' : ''} vinculada{vinculaciones.length > 1 ? 's' : ''}
            </p>
            {vinculaciones.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                <span>{v.nombreMostrar} — vinculado el {new Date(v.createdAt).toLocaleDateString('es-CO')}</span>
                <BotonDesvincularTelegram id={v.id} />
              </div>
            ))}
          </div>
        )}

        {alcanzoTope ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            Ya tiene el máximo de {TOPE_VINCULACIONES} personas vinculadas. Desvincule a alguien para agregar otra.
          </p>
        ) : (
          <>
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Por seguridad, los avisos de Tasa Directa se envían únicamente por
              la app de Telegram — es indispensable tenerla instalada para poder
              vincularse. Si no la tiene en su celular, descárguela primero:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href="https://play.google.com/store/apps/details?id=org.telegram.messenger"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Descargar para Android
              </Button>
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href="https://apps.apple.com/app/telegram-messenger/id686449807"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Descargar para iPhone
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
              <div
                className="mx-auto size-[148px] shrink-0 rounded-md border border-border bg-white p-1 sm:mx-0"
                dangerouslySetInnerHTML={{ __html: qrSvg! }}
              />
              <div className="grid gap-2">
                <p className="text-muted-foreground">
                  {vinculaciones.length > 0 ? (
                    <>Puede vincular hasta {TOPE_VINCULACIONES - vinculaciones.length} persona{TOPE_VINCULACIONES - vinculaciones.length > 1 ? 's' : ''} más de su empresa: escaneen el mismo código o abran el enlace.</>
                  ) : (
                    <>Vincule su cuenta para recibir un aviso al instante cada vez que alguien responda a sus ofertas. Escanee el código con la cámara de su celular, o toque el botón si ya tiene Telegram en este dispositivo, y presione <strong>Iniciar</strong>.</>
                  )}
                </p>
                <Button size="sm" className="w-fit" render={<a href={enlace} target="_blank" rel="noopener noreferrer" />}>
                  {vinculaciones.length > 0 ? 'Vincular otra persona' : 'Vincular mi Telegram'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Por seguridad, la operación es dinero: mantenga sus avisos en un
                  canal privado y no comparta este enlace.
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
