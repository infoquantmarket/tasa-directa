import { describe, it, expect } from 'vitest'
import {
  TIPOS_DOCUMENTO,
  TODOS_TIPOS_DOCUMENTO,
  ETIQUETAS_DOCUMENTO,
  validarArchivoKyc,
  puedeAprobarUsuario,
} from '@/lib/validation/kyc'

describe('constantes KYC', () => {
  it('define exactamente los 3 documentos requeridos para aprobar', () => {
    expect(TIPOS_DOCUMENTO).toEqual(['rut', 'camara_comercio', 'resolucion_dian'])
  })
  it('TODOS_TIPOS_DOCUMENTO agrega el opcional de composición accionaria', () => {
    expect(TODOS_TIPOS_DOCUMENTO).toEqual([
      'rut', 'camara_comercio', 'resolucion_dian', 'composicion_accionaria',
    ])
  })
  it('ETIQUETAS_DOCUMENTO cubre los 4 tipos de documento', () => {
    expect(Object.keys(ETIQUETAS_DOCUMENTO)).toHaveLength(4)
  })
})

describe('validarArchivoKyc', () => {
  it('acepta un PDF de 2 MB', () => {
    expect(validarArchivoKyc('application/pdf', 2 * 1024 * 1024)).toBeNull()
  })
  it('rechaza archivos de más de 10 MB', () => {
    expect(validarArchivoKyc('application/pdf', 11 * 1024 * 1024)).toMatch(/10 MB/)
  })
  it('rechaza tipos no permitidos (docx)', () => {
    expect(
      validarArchivoKyc('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024)
    ).toMatch(/PDF|JPG|PNG/)
  })
})

describe('puedeAprobarUsuario', () => {
  it('true solo cuando los 3 documentos están aprobados', () => {
    expect(puedeAprobarUsuario([
      { tipo_documento: 'rut', estado: 'aprobado' },
      { tipo_documento: 'camara_comercio', estado: 'aprobado' },
      { tipo_documento: 'resolucion_dian', estado: 'aprobado' },
    ])).toBe(true)
  })
  it('false si falta un documento', () => {
    expect(puedeAprobarUsuario([
      { tipo_documento: 'rut', estado: 'aprobado' },
      { tipo_documento: 'camara_comercio', estado: 'aprobado' },
    ])).toBe(false)
  })
  it('false si alguno está pendiente o rechazado', () => {
    expect(puedeAprobarUsuario([
      { tipo_documento: 'rut', estado: 'aprobado' },
      { tipo_documento: 'camara_comercio', estado: 'rechazado' },
      { tipo_documento: 'resolucion_dian', estado: 'aprobado' },
    ])).toBe(false)
  })
})
