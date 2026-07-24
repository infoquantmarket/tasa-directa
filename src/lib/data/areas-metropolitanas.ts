/**
 * Áreas metropolitanas oficiales (DANE) usadas para agrupar destinatarios de
 * la "alerta premium a mi ciudad": un PCD en Envigado debe recibir la alerta
 * de una oferta publicada por alguien en Medellín, y viceversa. Se arranca
 * con las 3 áreas que Jaime confirmó; se puede ampliar sin tocar el resto
 * del código (`ciudadesDelGrupo` solo lee este arreglo).
 */
const AREAS_METROPOLITANAS: string[][] = [
  // Valle de Aburrá
  ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Sabaneta', 'La Estrella',
   'Caldas', 'Copacabana', 'Girardota', 'Barbosa'],
  // Bogotá y sabana cercana
  ['Bogotá D.C.', 'Soacha', 'Chía', 'Cota', 'Funza', 'Mosquera'],
  // Cali (Valle del Cauca)
  ['Cali', 'Yumbo', 'Jamundí', 'Palmira'],
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
