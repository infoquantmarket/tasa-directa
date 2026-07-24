/**
 * Áreas metropolitanas oficiales (DANE) usadas para agrupar ciudades tanto
 * en la "alerta premium a mi ciudad" como en el filtro por zona del tablero
 * de ofertas.
 *
 * Los valores deben coincidir EXACTO con lo que guarda `perfiles_usuarios.ciudad`,
 * que es `etiquetaCiudad()` de `ciudades-colombia.ts`: "Ciudad (Departamento)"
 * — no solo el nombre de la ciudad. Varios nombres de ciudad se repiten en más
 * de un departamento (Caldas, Barbosa, Mosquera), así que hay que incluir
 * siempre el departamento para no mezclar municipios sin relación.
 *
 * Se arranca con las 3 áreas que Jaime confirmó; se puede ampliar sin tocar
 * el resto del código (`ciudadesDelGrupo`/`grupoDe` solo leen este arreglo).
 */
export interface GrupoMetropolitano {
  nombre: string
  ciudades: string[]
}

const AREAS_METROPOLITANAS: GrupoMetropolitano[] = [
  {
    nombre: 'Valle de Aburrá',
    ciudades: [
      'Medellín (Antioquia)', 'Bello (Antioquia)', 'Itagüí (Antioquia)',
      'Envigado (Antioquia)', 'Sabaneta (Antioquia)', 'La Estrella (Antioquia)',
      'Caldas (Antioquia)', 'Copacabana (Antioquia)', 'Girardota (Antioquia)',
      'Barbosa (Antioquia)',
    ],
  },
  {
    nombre: 'Bogotá y sabana',
    ciudades: [
      'Bogotá (Bogotá D.C.)', 'Soacha (Cundinamarca)', 'Chía (Cundinamarca)',
      'Cota (Cundinamarca)', 'Funza (Cundinamarca)', 'Mosquera (Cundinamarca)',
    ],
  },
  {
    nombre: 'Cali',
    ciudades: [
      'Cali (Valle del Cauca)', 'Yumbo (Valle del Cauca)',
      'Jamundí (Valle del Cauca)', 'Palmira (Valle del Cauca)',
    ],
  },
]

/** "Cartagena (Bolívar)" → "Cartagena" — para mostrar en UI sin el departamento. */
export function soloCiudad(ciudad: string): string {
  return ciudad.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * Devuelve todas las ciudades del mismo grupo metropolitano que `ciudad`
 * (incluida ella misma). Si `ciudad` no pertenece a ningún grupo conocido,
 * devuelve un arreglo con solo esa ciudad.
 */
export function ciudadesDelGrupo(ciudad: string): string[] {
  return grupoDe(ciudad).ciudades
}

/**
 * Devuelve el grupo metropolitano (nombre + ciudades) al que pertenece
 * `ciudad`. Si no pertenece a ningún grupo conocido, devuelve un grupo de
 * una sola ciudad cuyo nombre es la ciudad sin el departamento.
 */
export function grupoDe(ciudad: string): GrupoMetropolitano {
  const normalizada = ciudad.trim()
  const grupo = AREAS_METROPOLITANAS.find((g) => g.ciudades.includes(normalizada))
  if (grupo) return grupo
  return { nombre: soloCiudad(normalizada), ciudades: [normalizada] }
}
