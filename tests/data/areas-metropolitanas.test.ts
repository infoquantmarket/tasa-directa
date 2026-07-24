import { describe, it, expect } from 'vitest'
import { ciudadesDelGrupo } from '@/lib/data/areas-metropolitanas'

describe('ciudadesDelGrupo', () => {
  it('devuelve el área metropolitana completa del Valle de Aburrá', () => {
    const grupo = ciudadesDelGrupo('Medellín')
    expect(grupo).toContain('Medellín')
    expect(grupo).toContain('Envigado')
    expect(grupo).toContain('Itagüí')
    expect(grupo).toContain('Bello')
    expect(grupo).toContain('Sabaneta')
  })
  it('un municipio del grupo también devuelve el grupo completo (simétrico)', () => {
    expect(ciudadesDelGrupo('Envigado')).toEqual(ciudadesDelGrupo('Medellín'))
  })
  it('devuelve el grupo de Bogotá y sabana cercana', () => {
    const grupo = ciudadesDelGrupo('Bogotá D.C.')
    expect(grupo).toContain('Bogotá D.C.')
    expect(grupo).toContain('Soacha')
    expect(grupo).toContain('Chía')
  })
  it('devuelve el grupo de Cali (Valle del Cauca)', () => {
    const grupo = ciudadesDelGrupo('Cali')
    expect(grupo).toContain('Cali')
    expect(grupo).toContain('Yumbo')
    expect(grupo).toContain('Palmira')
    expect(grupo).toContain('Jamundí')
  })
  it('una ciudad sin área metropolitana definida devuelve solo ella misma', () => {
    expect(ciudadesDelGrupo('Cartagena')).toEqual(['Cartagena'])
  })
  it('es insensible a espacios de más pero no a tildes/mayúsculas (coincide exacto con el valor guardado)', () => {
    expect(ciudadesDelGrupo('  Medellín  ')).toEqual(ciudadesDelGrupo('Medellín'))
  })
})
