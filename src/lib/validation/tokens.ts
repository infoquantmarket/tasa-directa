import type { TokenConcepto } from '@/types/database'

export const ETIQUETAS_CONCEPTO: Record<TokenConcepto, string> = {
  compra: 'Compra de tokens',
  ajuste_admin: 'Ajuste del administrador',
  destacar_oferta: 'Destacar oferta',
  alerta_premium: 'Alerta premium',
  oferta_urgente: 'Oferta urgente',
  republicacion: 'Republicación automática',
  reembolso: 'Reembolso',
  oferta_adicional: 'Oferta adicional',
}

export function esCredito(delta: number): boolean {
  return delta > 0
}
