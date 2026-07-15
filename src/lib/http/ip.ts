/**
 * IP del cliente para trazabilidad legal. `x-real-ip` la fija el borde de Vercel
 * y el cliente no puede sobrescribirla — se prefiere. Si falta, se usa el ÚLTIMO
 * valor de `x-forwarded-for`: un cliente puede anteponer IPs falsas, pero Vercel
 * siempre AGREGA la IP real de conexión al final de la cadena.
 */
export function capturarIp(headerList: { get(name: string): string | null }): string | null {
  const real = headerList.get('x-real-ip')?.trim()
  if (real) return real

  const forwarded = headerList.get('x-forwarded-for')
  if (!forwarded) return null
  const partes = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
  return partes.at(-1) ?? null
}
