/**
 * "Vence en Xh Ymin" / "Vence en Ymin" / "Expirada" — para el stamp de
 * cuenta regresiva en las tarjetas de oferta. `ahora` es inyectable para
 * poder testear determinísticamente; en producción se omite (usa Date.now()).
 */
export function formatearCuentaRegresiva(expiraEn: string, ahora: Date = new Date()): string {
  const msRestantes = new Date(expiraEn).getTime() - ahora.getTime()
  if (msRestantes <= 0) return 'Expirada'

  const minutosTotales = Math.floor(msRestantes / 60_000)
  const horas = Math.floor(minutosTotales / 60)
  const minutos = minutosTotales % 60

  if (horas > 0) return `Vence en ${horas}h ${minutos}min`
  return `Vence en ${minutos}min`
}
