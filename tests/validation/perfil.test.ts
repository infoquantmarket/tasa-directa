import { describe, it, expect } from 'vitest'
import { perfilSchema, perfilCompleto } from '@/lib/validation/perfil'

const base = {
  razonSocial: 'Nutifinanzas S.A.S.',
  nombreComercial: '',
  nit: '811003775-5',
  tipoSociedad: 'sas',
  sede: 'Oviedo',
  direccion: 'Cra 43A #6 Sur-15, Oficina 201',
  ciudad: 'Medellín (Antioquia)',
  telefono: '6044442211',
  sitioWeb: '',
  repNombre: 'Juana Pérez',
  repTipoDoc: 'CC',
  repNumDoc: '43111222',
  repCorreo: 'juana@nutifinanzas.co',
  repCelular: '3001234567',
  contactoNombre: 'Carlos Ruiz',
  contactoCargo: 'Tesorería',
  contactoCelular: '3019876543',
  contactoCorreo: 'carlos@nutifinanzas.co',
  contactoWhatsapp: '',
}

describe('perfilSchema', () => {
  it('acepta un perfil completo válido', () => {
    expect(perfilSchema.safeParse(base).success).toBe(true)
  })
  it('rechaza razón social vacía', () => {
    expect(perfilSchema.safeParse({ ...base, razonSocial: '' }).success).toBe(false)
  })
  it('rechaza tipo de sociedad no permitido', () => {
    expect(perfilSchema.safeParse({ ...base, tipoSociedad: 'xyz' }).success).toBe(false)
  })
  it('rechaza dirección vacía', () => {
    expect(perfilSchema.safeParse({ ...base, direccion: '' }).success).toBe(false)
  })
  it('rechaza correo del representante inválido', () => {
    expect(perfilSchema.safeParse({ ...base, repCorreo: 'no' }).success).toBe(false)
  })
  it('rechaza celular de contacto no numérico', () => {
    expect(perfilSchema.safeParse({ ...base, contactoCelular: 'abc' }).success).toBe(false)
  })
  it('permite opcionales vacíos (nombreComercial, sitioWeb, contactoWhatsapp, contactoCargo)', () => {
    expect(perfilSchema.safeParse({
      ...base, nombreComercial: '', sitioWeb: '', contactoWhatsapp: '', contactoCargo: '',
    }).success).toBe(true)
  })
  it('acepta sitioWeb sin protocolo (miempresa.com)', () => {
    expect(perfilSchema.safeParse({ ...base, sitioWeb: 'nutifinanzas.co' }).success).toBe(true)
  })
  it('acepta sitioWeb con www y sin protocolo', () => {
    expect(perfilSchema.safeParse({ ...base, sitioWeb: 'www.nutifinanzas.co' }).success).toBe(true)
  })
  it('acepta sitioWeb con protocolo https', () => {
    expect(perfilSchema.safeParse({ ...base, sitioWeb: 'https://www.nutifinanzas.co' }).success).toBe(true)
  })
  it('rechaza sitioWeb sin dominio válido', () => {
    expect(perfilSchema.safeParse({ ...base, sitioWeb: 'no es un dominio' }).success).toBe(false)
  })
})

describe('perfilCompleto', () => {
  it('true cuando perfil_completo del registro es true', () => {
    expect(perfilCompleto({ perfil_completo: true })).toBe(true)
  })
  it('false cuando es false o el perfil es null', () => {
    expect(perfilCompleto({ perfil_completo: false })).toBe(false)
    expect(perfilCompleto(null)).toBe(false)
  })
})
