/**
 * Origin absoluto de la request actual, para construir `redirectTo` en
 * enlaces de correo (recuperación de contraseña). El Site URL configurado
 * en el dashboard de Supabase siempre apunta a producción — sin este origin
 * explícito, un enlace generado en Preview mandaría al usuario a producción
 * (rama master, que no tiene este código).
 */
export function construirOrigin(headerList: { get(name: string): string | null }): string {
  const host = headerList.get('host') ?? 'www.tasadirecta.com'
  const proto = headerList.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}
