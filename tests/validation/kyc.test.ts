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
  const docsCompletos = [
    { tipo_documento: 'rut' as const, estado: 'aprobado' as const },
    { tipo_documento: 'camara_comercio' as const, estado: 'aprobado' as const },
    { tipo_documento: 'resolucion_dian' as const, estado: 'aprobado' as const },
  ]

  it('true cuando los 3 documentos están aprobados Y la identidad está Approved', () => {
    expect(puedeAprobarUsuario(docsCompletos, { estado: 'Approved' })).toBe(true)
  })
  it('false si falta un documento, aunque la identidad esté Approved', () => {
    expect(puedeAprobarUsuario(docsCompletos.slice(0, 2), { estado: 'Approved' })).toBe(false)
  })
  it('false si alguno de los documentos está pendiente o rechazado', () => {
    const docsConUnoRechazado = [
      docsCompletos[0],
      { tipo_documento: 'camara_comercio' as const, estado: 'rechazado' as const },
      docsCompletos[2],
    ]
    expect(puedeAprobarUsuario(docsConUnoRechazado, { estado: 'Approved' })).toBe(false)
  })
  it('false si los 3 documentos están aprobados pero la identidad NO está Approved', () => {
    expect(puedeAprobarUsuario(docsCompletos, { estado: 'Not Started' })).toBe(false)
    expect(puedeAprobarUsuario(docsCompletos, { estado: 'In Review' })).toBe(false)
  })
  it('false si los 3 documentos están aprobados pero no hay verificación de identidad todavía', () => {
    expect(puedeAprobarUsuario(docsCompletos, null)).toBe(false)
    expect(puedeAprobarUsuario(docsCompletos, undefined)).toBe(false)
  })
})
