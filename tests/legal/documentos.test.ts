import { describe, it, expect } from 'vitest'
import {
  DOCUMENTOS_LEGALES,
  SLUGS_LEGALES,
  SLUGS_ETAPA_CONTRATO,
  SLUG_ETAPA_VINCULACION,
  documentoPorSlug,
  documentosPorEtapa,
  VERSION_LEGAL,
} from '@/lib/legal/documentos'

describe('registro de documentos legales', () => {
  it('tiene exactamente 7 documentos con slugs únicos', () => {
    expect(DOCUMENTOS_LEGALES).toHaveLength(7)
    expect(new Set(SLUGS_LEGALES).size).toBe(7)
  })

  it('la autorización de datos se acepta en la etapa de vinculación', () => {
    expect(SLUG_ETAPA_VINCULACION).toBe('tratamiento_datos')
    expect(documentoPorSlug('tratamiento_datos')?.etapa).toBe('vinculacion')
  })

  it('los otros 6 se aceptan en la etapa de contrato', () => {
    expect(SLUGS_ETAPA_CONTRATO).toHaveLength(6)
    expect(SLUGS_ETAPA_CONTRATO).not.toContain('tratamiento_datos')
    expect(documentosPorEtapa('contrato')).toHaveLength(6)
  })

  it('todo documento tiene título, versión y texto no vacío', () => {
    for (const d of DOCUMENTOS_LEGALES) {
      expect(d.titulo.length).toBeGreaterThan(0)
      expect(d.version).toBe(VERSION_LEGAL)
      expect(d.texto.trim().length).toBeGreaterThan(100)
    }
  })

  it('los textos publicados no contienen meta-comentarios ni placeholders', () => {
    for (const d of DOCUMENTOS_LEGALES) {
      expect(d.texto).not.toMatch(/abogado revisor/i)
      expect(d.texto).not.toMatch(/\[TEXTO PENDIENTE/i)
      expect(d.texto).not.toContain('☐')
    }
  })
})
