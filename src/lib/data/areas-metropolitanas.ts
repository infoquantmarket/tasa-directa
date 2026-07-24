/**
 * Áreas metropolitanas oficiales (DANE) usadas para agrupar destinatarios de
 * la "alerta premium a mi ciudad": un PCD en Envigado debe recibir la alerta
 * de una oferta publicada por alguien en Medellín, y viceversa.
 *
 * Los valores deben coincidir EXACTO con lo que guarda `perfiles_usuarios.ciudad`,
 * que es `etiquetaCiudad()` de `ciudades-colombia.ts`: "Ciudad (Departamento)"
 * — no solo el nombre de la ciudad. Varios nombres de ciudad se repiten en más
 * de un departamento (Caldas, Barbosa, Mosquera), así que hay que incluir
 * siempre el departamento para no mezclar municipios sin relación.
 *
 * Se arranca con las 3 áreas que Jaime confirmó; se puede ampliar sin tocar
 * el resto del código (`ciudadesDelGrupo` solo lee este arreglo).
 */
const AREAS_METROPOLITANAS: string[][] = [
  // Valle de Aburrá
  [
    'Medellín (Antioquia)', 'Bello (Antioquia)', 'Itagüí (Antioquia)',
    'Envigado (Antioquia)', 'Sabaneta (Antioquia)', 'La Estrella (Antioquia)',
    'Caldas (Antioquia)', 'Copacabana (Antioquia)', 'Girardota (Antioquia)',
    'Barbosa (Antioquia)',
  ],
  // Bogotá y sabana cercana
  [
    'Bogotá (Bogotá D.C.)', 'Soacha (Cundinamarca)', 'Chía (Cundinamarca)',
    'Cota (Cundinamarca)', 'Funza (Cundinamarca)', 'Mosquera (Cundinamarca)',
  ],
  // Cali (Valle del Cauca)
  [
    'Cali (Valle del Cauca)', 'Yumbo (Valle del Cauca)',
    'Jamundí (Valle del Cauca)', 'Palmira (Valle del Cauca)',
  ],
]

/**
 * Devuelve todas las ciudades del mismo grupo metropolitano que `ciudad`
 * (incluida ella misma). Si `ciudad` no pertenece a ningún grupo conocido,
 * devuelve un arreglo con solo esa ciudad.
 */
export function ciudadesDelGrupo(ciudad: string): string[] {
  const normalizada = ciudad.trim()
  const grupo = AREAS_METROPOLITANAS.find((g) => g.includes(normalizada))
  return grupo ?? [normalizada]
}
