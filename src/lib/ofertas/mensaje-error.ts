/**
 * Traduce los `raise exception` de Postgres (triggers/funciones) a mensajes
 * que tienen sentido para el PCD. Los triggers ya escriben mensajes en
 * español pensados para mostrarse tal cual; solo se agrega contexto cuando
 * el mensaje de Postgres no alcanza a explicar el porqué. `contextoSaldo`
 * ajusta el mensaje de saldo insuficiente al servicio que lo disparó (cada
 * uno consume tokens por un motivo distinto).
 */
export function mensajeDesdeError(
  error: { message: string } | null,
  contextoSaldo = 'Ya tiene 2 ofertas activas gratis. Publicar una adicional requiere tokens y no tiene saldo suficiente.'
): string {
  if (!error) return 'Ocurrió un error inesperado. Intente de nuevo.'
  if (error.message.includes('Saldo insuficiente')) return contextoSaldo
  return error.message
}
