import QRCode from 'qrcode'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { deepLinkVinculacion } from '@/lib/telegram/vinculacion'

export async function TelegramCard({
  chatId,
  token,
}: {
  chatId: string | null
  token: string | null | undefined
}) {
  // Resiliencia: si aún no hay token (migración 0010 sin aplicar), no se
  // muestra la tarjeta en vez de renderizar un QR inválido.
  if (!token) return null

  if (chatId) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Avisos por Telegram</CardTitle>
          <Send className="size-5 text-primary" />
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p className="font-medium text-primary">Vinculado</p>
          <p className="text-muted-foreground">
            Recibirá un mensaje en Telegram cada vez que alguien responda a una
            de sus ofertas.
          </p>
        </CardContent>
      </Card>
    )
  }

  const enlace = deepLinkVinculacion(token)
  const qrSvg = await QRCode.toString(enlace, { type: 'svg', margin: 1, width: 148 })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Avisos por Telegram</CardTitle>
        <Send className="size-5 text-primary" />
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-[auto_1fr] sm:items-center">
        <div
          className="mx-auto size-[148px] shrink-0 rounded-md border border-border bg-white p-1 sm:mx-0"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="grid gap-2">
          <p className="text-muted-foreground">
            Vincule su Telegram para recibir un aviso al instante cada vez que
            alguien responda a sus ofertas. Escanee el código con la cámara de
            su celular, o toque el botón si ya tiene Telegram en este
            dispositivo, y presione <strong>Iniciar</strong>.
          </p>
          <Button size="sm" className="w-fit" render={<a href={enlace} target="_blank" rel="noopener noreferrer" />}>
            Vincular mi Telegram
          </Button>
          <p className="text-xs text-muted-foreground">
            Por seguridad, la operación es dinero: mantenga sus avisos en un
            canal privado y no comparta este enlace.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
