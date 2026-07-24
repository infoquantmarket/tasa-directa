import { describe, it, expect } from 'vitest'
import { ciudadesDelGrupo } from '@/lib/data/areas-metropolitanas'

describe('ciudadesDelGrupo', () => {
  it('devuelve el área metropolitana completa del Valle de Aburrá', () => {
    const grupo = ciudadesDelGrupo('Medellín (Antioquia)')
    expect(grupo).toContain('Medellín (Antioquia)')
    expect(grupo).toContain('Envigado (Antioquia)')
    expect(grupo).toContain('Itagüí (Antioquia)')
    expect(grupo).toContain('Bello (Antioquia)')
    expect(grupo).toContain('Sabaneta (Antioquia)')
  })
  it('un municipio del grupo también devuelve el grupo completo (simétrico)', () => {
    expect(ciudadesDelGrupo('Envigado (Antioquia)')).toEqual(ciudadesDelGrupo('Medellín (Antioquia)'))
  })
  it('devuelve el grupo de Bogotá y sabana cercana', () => {
    const grupo = ciudadesDelGrupo('Bogotá (Bogotá D.C.)')
    expect(grupo).toContain('Bogotá (Bogotá D.C.)')
    expect(grupo).toContain('Soacha (Cundinamarca)')
    expect(grupo).toContain('Chía (Cundinamarca)')
  })
  it('devuelve el grupo de Cali (Valle del Cauca)', () => {
    const grupo = ciudadesDelGrupo('Cali (Valle del Cauca)')
    expect(grupo).toContain('Cali (Valle del Cauca)')
    expect(grupo).toContain('Yumbo (Valle del Cauca)')
    expect(grupo).toContain('Palmira (Valle del Cauca)')
    expect(grupo).toContain('Jamundí (Valle del Cauca)')
  })
  it('una ciudad sin área metropolitana definida devuelve solo ella misma', () => {
    expect(ciudadesDelGrupo('Cartagena (Bolívar)')).toEqual(['Cartagena (Bolívar)'])
  })
  it('no mezcla ciudades homónimas de otro departamento (Caldas, Barbosa, Mosquera)', () => {
    expect(ciudadesDelGrupo('Caldas (Boyacá)')).toEqual(['Caldas (Boyacá)'])
    expect(ciudadesDelGrupo('Barbosa (Santander)')).toEqual(['Barbosa (Santander)'])
    expect(ciudadesDelGrupo('Mosquera (Nariño)')).toEqual(['Mosquera (Nariño)'])
  })
  it('es insensible a espacios de más pero no a tildes/mayúsculas (coincide exacto con el valor guardado)', () => {
    expect(ciudadesDelGrupo('  Medellín (Antioquia)  ')).toEqual(ciudadesDelGrupo('Medellín (Antioquia)'))
  })
})
