import type { EstadoMembresia } from '@/types/database'

export interface MembresiaResumen {
  estado: EstadoMembresia
  fecha_inicio: string   // 'YYYY-MM-DD'
  fecha_fin: string | null
}

/**
 * Réplica en UI de public.tiene_membresia_activa() — la barrera real es el
 * trigger de la BD; esto solo pinta el estado correcto en pantalla.
 * `hoy` en formato 'YYYY-MM-DD' (fecha Colombia provista por el caller).
 */
export function esMembresiaVigente(
  m: MembresiaResumen | null | undefined,
  hoy: string
): boolean {
  if (!m || m.estado !== 'activa') return false
  if (m.fecha_inicio > hoy) return false
  if (m.fecha_fin !== null && m.fecha_fin < hoy) return false
  return true
}

/** Fecha de hoy en zona América/Bogotá, formato YYYY-MM-DD. */
export function fechaColombiaHoy(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}
