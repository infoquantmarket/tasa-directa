# Documentos legales · Click-wrap de los 7 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar los 7 documentos legales como páginas públicas y habilitar su aceptación click-wrap con registro inmutable individual (una casilla por documento), capturando un snapshot de identidad para blindar la evidencia.

**Architecture:** Un registro central (`DOCUMENTOS_LEGALES`) es la única fuente de verdad de los 7 textos, sus versiones y en qué etapa se aceptan. La Autorización de Tratamiento de Datos (`tratamiento_datos`) se acepta en la etapa 2 (`/vinculacion`, junto con la entrega de datos, por Habeas Data); los otros 6 en la etapa 3 (`/contrato`). Cada aceptación inserta una fila inmutable en `aceptaciones` con documento, versión, IP no falsificable, user-agent y snapshot `{razon_social, nit, rep_nombre, rep_num_doc}`. Los textos se publican limpios (sin meta-comentarios ni typos), como versión final.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (Postgres + RLS), Tailwind + shadcn/ui (Base UI), Vitest, zod.

---

## Contexto imprescindible para el ejecutor (sin memoria del proyecto)

- **shadcn está sobre Base UI, NO Radix.** `Button` no tiene `asChild`: para envolver un `Link` usa `<Button render={<Link href="…" />}>texto</Button>`.
- **Patrón de preservación de valores tras error de Server Action:** ver `src/app/vinculacion/vinculacion-form.tsx` (compara `state !== prevState` en el cuerpo del render, NO en `useEffect`; un `resetKey` fuerza remount de inputs para reaplicar `defaultValue`). No inventes otro patrón.
- **IP no falsificable:** ver `src/app/contrato/actions.ts` función `capturarIp` — prefiere `x-real-ip`, cae al ÚLTIMO segmento de `x-forwarded-for` (Vercel siempre agrega la IP real al final). Esta función se EXTRAE a un módulo compartido en la Task 3 y se reutiliza; no se duplica.
- **Ledger inmutable:** `aceptaciones` tiene RLS con select (propias/admin) e insert (propias), sin update/delete. No agregar políticas de update/delete.
- **Los textos ya existen en disco** en `docs/legales-borrador/*.txt` (extraídos de los .docx). Son la fuente para transcribir a `textos.ts`, aplicando las limpiezas listadas en la Task 2.
- **AGENTS.md:** «This is NOT the Next.js you know» — ante dudas de API, leer `node_modules/next/dist/docs/`.
- Verificación estándar del proyecto: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`.

## Los 7 documentos (slug · etapa · versión `v1-2026-07`)

| Slug | Documento | Etapa de aceptación | Fuente .txt |
|---|---|---|---|
| `contrato_servicios` | Contrato de Prestación de Servicios | contrato (3) | `A_Contrato_de_Prestacion_de_Servicios.txt` |
| `tratamiento_datos` | Autorización Tratamiento de Datos | **vinculacion (2)** | `B_Autorizacion_Tratamiento_de_Datos.txt` |
| `politica_tratamiento` | Política de Tratamiento de Datos | contrato (3) | `C_Politica_Tratamiento_de_Datos.txt` |
| `terminos_condiciones` | Términos y Condiciones | contrato (3) | `D_Terminos_y_Condiciones.txt` |
| `aviso_privacidad` | Aviso de Privacidad | contrato (3) | `E_Aviso_de_Privacidad.txt` |
| `politica_kyc` | Política de Verificación KYC | contrato (3) | `F_Politica_Verificacion_KYC.txt` |
| `politica_reembolsos` | Política de Reembolsos | contrato (3) | `G_Politica_de_Reembolsos.txt` |

## File Structure

- **Create** `supabase/migrations/0005_documentos_legales.sql` — amplía el CHECK de `aceptaciones` a los 7 slugs + columnas snapshot de identidad.
- **Create** `src/lib/legal/textos.ts` — las 7 cadenas de texto legal, limpias.
- **Create** `src/lib/legal/documentos.ts` — el registro `DOCUMENTOS_LEGALES` + tipos + helpers.
- **Delete/replace** `src/lib/legal/contrato.ts` — reemplazado por `documentos.ts` (se mantienen re-exports de compatibilidad solo si algún import externo lo requiere; ver Task 2).
- **Create** `src/lib/http/ip.ts` — `capturarIp` compartida (extraída de `contrato/actions.ts`).
- **Create** `tests/legal/documentos.test.ts` — invariantes del registro.
- **Create** `tests/http/ip.test.ts` — casos de `capturarIp`.
- **Create** `src/app/legal/[slug]/page.tsx` — página pública por documento.
- **Create** `src/app/legal/page.tsx` — índice público de los 7.
- **Modify** `src/types/database.ts:19` — `TipoAceptacion` a 7 slugs; fila `aceptaciones` con columnas snapshot.
- **Modify** `src/app/vinculacion/vinculacion-form.tsx` — casilla de Autorización de Datos.
- **Modify** `src/app/vinculacion/actions.ts` — registrar aceptación de `tratamiento_datos` con snapshot al guardar perfil.
- **Modify** `src/app/vinculacion/page.tsx` — pasar estado de aceptación previa al form.
- **Modify** `src/app/contrato/contrato-form.tsx` — iterar los 6 docs de etapa 3, 6 casillas.
- **Modify** `src/app/contrato/actions.ts` — insertar hasta 6 filas con snapshot; usar `capturarIp` compartida.
- **Modify** `src/app/contrato/page.tsx` — guard: ya aceptó los 6 → redirect.
- **Modify** `src/app/dashboard/page.tsx` — estado de contrato refleja los 6.
- **Modify** `src/app/admin/usuarios/[id]/page.tsx` — mostrar estado de los 7.
- **Modify** `src/components/site-footer.tsx` (o crear si no existe) — enlaces a `/legal`.
- **Modify** `README.md`, `docs/CONTEXTO-PROYECTO.md` — documentar.

---

### Task L1: Migration 0005 — ampliar `aceptaciones` + snapshot de identidad

**Files:**
- Create: `supabase/migrations/0005_documentos_legales.sql`

- [ ] **Step 1: Escribir la migration**

```sql
-- =============================================================================
-- TASA DIRECTA · Documentos legales · Click-wrap de los 7
-- Amplía el catálogo de documentos aceptables y guarda snapshot de identidad
-- para que cada aceptación sea prueba autosuficiente. Idempotente.
-- =============================================================================

-- 1. El CHECK inline de 0004 se llama aceptaciones_documento_check (auto-nombrado).
alter table public.aceptaciones drop constraint if exists aceptaciones_documento_check;
alter table public.aceptaciones
  add constraint aceptaciones_documento_check
  check (documento in (
    'contrato_servicios',
    'tratamiento_datos',
    'politica_tratamiento',
    'terminos_condiciones',
    'aviso_privacidad',
    'politica_kyc',
    'politica_reembolsos'
  ));

-- 2. Snapshot de identidad al momento de aceptar (perfil es editable; esto no).
alter table public.aceptaciones
  add column if not exists razon_social text,
  add column if not exists nit          text,
  add column if not exists rep_nombre   text,
  add column if not exists rep_num_doc  text;
```

- [ ] **Step 2: Verificar sintaxis localmente**

Run: `cat supabase/migrations/0005_documentos_legales.sql`
Expected: el archivo existe con el contenido anterior. (La aplicación real la corre Jaime en Supabase SQL Editor; no hay CLI de supabase local aquí.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_documentos_legales.sql
git commit -m "feat(db): migration 0005 — 7 documentos legales aceptables + snapshot de identidad"
```

---

### Task L2: Registro de documentos legales + textos limpios

**Files:**
- Create: `src/lib/legal/textos.ts`
- Create: `src/lib/legal/documentos.ts`
- Test: `tests/legal/documentos.test.ts`
- Delete: `src/lib/legal/contrato.ts` (tras migrar sus consumidores en Tasks L5/L6)

**Limpiezas OBLIGATORIAS al transcribir cada .txt a `textos.ts`** (quitar meta-comentarios internos y typos; NO alterar el fondo jurídico):

- **A (contrato):** en Cláusula 3, «prestados bajo otras que la sociedad opere en el futuro» → «prestados bajo otras marcas que la sociedad opere en el futuro». Quitar las líneas de cabecera repetidas (`Operador legal`, `Plataforma`, `Fecha`, etiquetas sueltas) que son metadatos del .docx, no cuerpo del contrato — el cuerpo empieza en «Partes / Entre los suscritos…». Conservar títulos de cláusula.
- **B (autorización):** quitar la última línea «☐ He leído y acepto…» (esa casilla es la UI de la app, no parte del texto). Quitar cabeceras de metadatos; el cuerpo es desde «Autorizo de manera previa…» hasta «…la cual declaro haber podido consultar.»
- **C (política tratamiento):** en la sección 11 (Conservación) hay frases duplicadas por copy-paste; dejar UNA redacción coherente: «Los datos se conservarán mientras exista la relación con el Usuario y durante el plazo necesario para el cumplimiento de las obligaciones legales, contables, fiscales y probatorias exigibles en Colombia. Una vez terminada la relación y finalizados los términos de prescripción de las acciones pertinentes, los datos se suprimirán o anonimizarán de forma segura.» Quitar cabeceras de metadatos.
- **D (términos):** sección 13, «tribunal de arbitraje , con sede» → «tribunal de arbitraje, con sede» (quitar espacio antes de coma). Quitar cabeceras de metadatos.
- **E (aviso):** «canal de PQRS info@bitwaveco.com .» → «canal de PQRS info@bitwaveco.com.» (quitar espacio antes del punto). Quitar cabeceras de metadatos.
- **F (KYC):** sección 7, reemplazar la cita larga y duplicada del párrafo de conservación por: «El plazo específico se define en la Política de Tratamiento de Datos Personales.» Quitar cabeceras de metadatos.
- **G (reembolsos):** **QUITAR** el meta-comentario dirigido al abogado en la sección 2: la frase «Esta calificación —Usuario profesional vs. consumidor— es precisamente uno de los puntos que debe confirmar el abogado revisor, verificando el caso concreto frente a la definición de "consumidor" del artículo 5 de la Ley 1480.» (todo el párrafo). Typos: «Cancelacion»→«Cancelación», «10 dias habiles»→«10 días hábiles», «30 dias calendarios»→«30 días calendario», «360 dias»→«360 días», «recepcion»→«recepción». Sección 8: «(Cláusula 4.3)» → «(Cláusula 5.3)» (la cláusula de pagos del contrato es la 5.3). Quitar cabeceras de metadatos.

- [ ] **Step 1: Escribir el test del registro (falla primero)**

`tests/legal/documentos.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/legal/documentos.test.ts`
Expected: FAIL — «Cannot find module '@/lib/legal/documentos'».

- [ ] **Step 3: Crear `src/lib/legal/textos.ts`**

Transcribir el cuerpo limpio de cada .txt (aplicando las limpiezas de arriba) a una constante `string`. Estructura:

```ts
// Textos legales de Tasa Directa (BitWave S.A.S.). Fuente: docs/legales-borrador/.
// Publicados limpios (sin meta-comentarios ni typos) como versión final v1-2026-07.

export const TEXTO_CONTRATO_SERVICIOS = `Contrato de Prestación de Servicios
… (cuerpo limpio de A) …`.trim()

export const TEXTO_TRATAMIENTO_DATOS = `Autorización para el Tratamiento de Datos Personales
… (cuerpo limpio de B, sin la línea del checkbox) …`.trim()

export const TEXTO_POLITICA_TRATAMIENTO = `Política de Tratamiento de Datos Personales
… (cuerpo limpio de C) …`.trim()

export const TEXTO_TERMINOS_CONDICIONES = `Términos y Condiciones de Uso
… (cuerpo limpio de D) …`.trim()

export const TEXTO_AVISO_PRIVACIDAD = `Aviso de Privacidad
… (cuerpo limpio de E) …`.trim()

export const TEXTO_POLITICA_KYC = `Política de Verificación de Identidad y Vinculación (KYC)
… (cuerpo limpio de F) …`.trim()

export const TEXTO_POLITICA_REEMBOLSOS = `Política de Reembolsos
… (cuerpo limpio de G) …`.trim()
```

Nota de transcripción: cada `…` se reemplaza por el contenido real del .txt correspondiente. Mantener saltos de párrafo con líneas en blanco (los .txt ya vienen con doble salto entre párrafos). No incluir las cabeceras de metadatos del .docx (`TASA DIRECTA`, `Documentos legales de la plataforma`, `Operador legal`, `Plataforma`, `NIT`, `Fecha`), sí el título del documento y los títulos de sección.

- [ ] **Step 4: Crear `src/lib/legal/documentos.ts`**

```ts
import {
  TEXTO_CONTRATO_SERVICIOS,
  TEXTO_TRATAMIENTO_DATOS,
  TEXTO_POLITICA_TRATAMIENTO,
  TEXTO_TERMINOS_CONDICIONES,
  TEXTO_AVISO_PRIVACIDAD,
  TEXTO_POLITICA_KYC,
  TEXTO_POLITICA_REEMBOLSOS,
} from './textos'

export type SlugLegal =
  | 'contrato_servicios'
  | 'tratamiento_datos'
  | 'politica_tratamiento'
  | 'terminos_condiciones'
  | 'aviso_privacidad'
  | 'politica_kyc'
  | 'politica_reembolsos'

export type EtapaAceptacion = 'vinculacion' | 'contrato'

export interface DocumentoLegal {
  slug: SlugLegal
  titulo: string
  subtitulo: string
  version: string
  etapa: EtapaAceptacion
  /** Etiqueta corta de la casilla de aceptación. */
  etiquetaCasilla: string
  texto: string
}

export const VERSION_LEGAL = 'v1-2026-07'

export const DOCUMENTOS_LEGALES: DocumentoLegal[] = [
  {
    slug: 'contrato_servicios',
    titulo: 'Contrato de Prestación de Servicios',
    subtitulo: 'Acceso al marketplace B2B · Plataforma ⟷ PCD',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto el Contrato de Prestación de Servicios.',
    texto: TEXTO_CONTRATO_SERVICIOS,
  },
  {
    slug: 'tratamiento_datos',
    titulo: 'Autorización para el Tratamiento de Datos Personales',
    subtitulo: 'Ley 1581 de 2012',
    version: VERSION_LEGAL,
    etapa: 'vinculacion',
    etiquetaCasilla:
      'Autorizo el tratamiento de mis datos personales conforme a la Política de Tratamiento de Datos.',
    texto: TEXTO_TRATAMIENTO_DATOS,
  },
  {
    slug: 'politica_tratamiento',
    titulo: 'Política de Tratamiento de Datos Personales',
    subtitulo: 'Ley 1581 de 2012 y Decreto 1074 de 2015',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto la Política de Tratamiento de Datos Personales.',
    texto: TEXTO_POLITICA_TRATAMIENTO,
  },
  {
    slug: 'terminos_condiciones',
    titulo: 'Términos y Condiciones de Uso',
    subtitulo: 'Uso de la plataforma Tasa Directa',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto los Términos y Condiciones de Uso.',
    texto: TEXTO_TERMINOS_CONDICIONES,
  },
  {
    slug: 'aviso_privacidad',
    titulo: 'Aviso de Privacidad',
    subtitulo: 'Ley 1581 de 2012',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído el Aviso de Privacidad.',
    texto: TEXTO_AVISO_PRIVACIDAD,
  },
  {
    slug: 'politica_kyc',
    titulo: 'Política de Verificación de Identidad y Vinculación (KYC)',
    subtitulo: 'Qué se solicita, para qué y su alcance',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto la Política de Verificación de Identidad (KYC).',
    texto: TEXTO_POLITICA_KYC,
  },
  {
    slug: 'politica_reembolsos',
    titulo: 'Política de Reembolsos',
    subtitulo: 'Suscripción estándar y billetera de tokens',
    version: VERSION_LEGAL,
    etapa: 'contrato',
    etiquetaCasilla: 'He leído y acepto la Política de Reembolsos.',
    texto: TEXTO_POLITICA_REEMBOLSOS,
  },
]

export const SLUGS_LEGALES = DOCUMENTOS_LEGALES.map((d) => d.slug)

export const documentosPorEtapa = (etapa: EtapaAceptacion): DocumentoLegal[] =>
  DOCUMENTOS_LEGALES.filter((d) => d.etapa === etapa)

export const documentoPorSlug = (slug: string): DocumentoLegal | undefined =>
  DOCUMENTOS_LEGALES.find((d) => d.slug === slug)

/** Los 6 documentos que se aceptan en /contrato (etapa 3). */
export const SLUGS_ETAPA_CONTRATO = documentosPorEtapa('contrato').map((d) => d.slug)

/** El único documento que se acepta en /vinculacion (etapa 2). */
export const SLUG_ETAPA_VINCULACION: SlugLegal = 'tratamiento_datos'
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npm test -- tests/legal/documentos.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/legal/textos.ts src/lib/legal/documentos.ts tests/legal/documentos.test.ts
git commit -m "feat(legal): registro central de los 7 documentos + textos limpios v1-2026-07"
```

---

### Task L3: Tipos + `capturarIp` compartida

**Files:**
- Modify: `src/types/database.ts:19` y bloque `aceptaciones`
- Create: `src/lib/http/ip.ts`
- Test: `tests/http/ip.test.ts`

- [ ] **Step 1: Actualizar `TipoAceptacion` y la fila `aceptaciones` en `database.ts`**

Reemplazar la línea 19:

```ts
export type TipoAceptacion =
  | 'contrato_servicios'
  | 'tratamiento_datos'
  | 'politica_tratamiento'
  | 'terminos_condiciones'
  | 'aviso_privacidad'
  | 'politica_kyc'
  | 'politica_reembolsos'
```

En el bloque `aceptaciones` → `Row`, agregar las columnas snapshot (después de `user_agent`):

```ts
        Row: {
          id:         string
          usuario_id: string
          documento:  TipoAceptacion
          version:    string
          ip:         string | null
          user_agent: string | null
          razon_social: string | null
          nit:          string | null
          rep_nombre:   string | null
          rep_num_doc:  string | null
          created_at: string
        }
```

- [ ] **Step 2: Escribir el test de `capturarIp` (falla primero)**

`tests/http/ip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { capturarIp } from '@/lib/http/ip'

const H = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null })

describe('capturarIp', () => {
  it('prefiere x-real-ip', () => {
    expect(capturarIp(H({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
  })
  it('cae al ÚLTIMO segmento de x-forwarded-for (el que agrega Vercel)', () => {
    expect(capturarIp(H({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.9' }))).toBe('203.0.113.9')
  })
  it('devuelve null si no hay cabeceras', () => {
    expect(capturarIp(H({}))).toBeNull()
  })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npm test -- tests/http/ip.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 4: Crear `src/lib/http/ip.ts`**

```ts
/**
 * IP del cliente para trazabilidad legal. `x-real-ip` la fija el borde de Vercel
 * y el cliente no puede sobrescribirla — se prefiere. Si falta, se usa el ÚLTIMO
 * valor de `x-forwarded-for`: un cliente puede anteponer IPs falsas, pero Vercel
 * siempre AGREGA la IP real de conexión al final de la cadena.
 */
export function capturarIp(headerList: { get(name: string): string | null }): string | null {
  const real = headerList.get('x-real-ip')?.trim()
  if (real) return real

  const forwarded = headerList.get('x-forwarded-for')
  if (!forwarded) return null
  const partes = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
  return partes.at(-1) ?? null
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npm test -- tests/http/ip.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/http/ip.ts tests/http/ip.test.ts
git commit -m "feat(legal): tipos de aceptación a 7 slugs + snapshot; extrae capturarIp compartida"
```

---

### Task L4: Páginas legales públicas (`/legal`)

**Files:**
- Create: `src/app/legal/page.tsx` (índice)
- Create: `src/app/legal/[slug]/page.tsx` (documento)

- [ ] **Step 1: Crear `src/app/legal/[slug]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { documentoPorSlug, DOCUMENTOS_LEGALES } from '@/lib/legal/documentos'

export function generateStaticParams() {
  return DOCUMENTOS_LEGALES.map((d) => ({ slug: d.slug }))
}

export default async function DocumentoLegalPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = documentoPorSlug(slug)
  if (!doc) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/legal" className="text-sm text-primary hover:underline">
        ← Documentos legales
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{doc.titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {doc.subtitulo} · Versión {doc.version}
      </p>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {doc.texto}
      </article>
    </main>
  )
}
```

- [ ] **Step 2: Crear `src/app/legal/page.tsx` (índice)**

```tsx
import Link from 'next/link'
import { DOCUMENTOS_LEGALES } from '@/lib/legal/documentos'

export default function LegalIndexPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Documentos legales</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tasa Directa — BitWave S.A.S. · NIT 901.920.120-1
      </p>
      <ul className="mt-8 grid gap-3">
        {DOCUMENTOS_LEGALES.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/legal/${d.slug}`}
              className="block rounded-lg border border-border p-4 hover:bg-muted/40"
            >
              <span className="font-medium">{d.titulo}</span>
              <span className="block text-sm text-muted-foreground">{d.subtitulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: Verificar build de las rutas**

Run: `npm run build`
Expected: aparecen `/legal` y `/legal/[slug]` en la lista de rutas; build OK.

- [ ] **Step 4: Commit**

```bash
git add src/app/legal
git commit -m "feat(legal): páginas públicas de los 7 documentos en /legal"
```

---

### Task L5: Aceptación de la Autorización de Datos en `/vinculacion` (etapa 2)

**Files:**
- Modify: `src/app/vinculacion/actions.ts`
- Modify: `src/app/vinculacion/vinculacion-form.tsx`
- Modify: `src/app/vinculacion/page.tsx`

Comportamiento: al guardar el perfil, el usuario debe marcar la casilla de Autorización de Datos. Se registra una fila `aceptaciones` (`tratamiento_datos`, versión, IP, user-agent) con snapshot `{razon_social, nit, rep_nombre, rep_num_doc}` tomado de los datos que acaba de enviar. Idempotente: si ya aceptó esa versión, no se duplica. Si ya la había aceptado antes (reedita el perfil), no se exige volver a marcar.

- [ ] **Step 1: Modificar `guardarPerfil` en `src/app/vinculacion/actions.ts`**

Añadir imports arriba:

```ts
import { headers } from 'next/headers'
import { capturarIp } from '@/lib/http/ip'
import { SLUG_ETAPA_VINCULACION, VERSION_LEGAL } from '@/lib/legal/documentos'
```

Dentro de `guardarPerfil`, tras validar `parsed` y ANTES del `update`, calcular si ya aceptó y exigir la casilla si no:

```ts
  const d = parsed.data

  // ¿Ya aceptó la versión vigente de la autorización de datos?
  const { data: yaAcepto } = await supabase
    .from('aceptaciones')
    .select('id')
    .eq('usuario_id', user.id)
    .eq('documento', SLUG_ETAPA_VINCULACION)
    .eq('version', VERSION_LEGAL)
    .maybeSingle()

  const aceptaDatos = formData.get('autorizacion_datos') === 'on'
  if (!yaAcepto && !aceptaDatos) {
    return {
      error: 'Debe autorizar el tratamiento de datos personales para continuar.',
      valores: valoresDesdeFormData(formData),
    }
  }
```

Después del `update` exitoso (tras el `if (error) …`), registrar la aceptación si aún no existía:

```ts
  if (!yaAcepto) {
    const headerList = await headers()
    await supabase.from('aceptaciones').insert({
      usuario_id: user.id,
      documento: SLUG_ETAPA_VINCULACION,
      version: VERSION_LEGAL,
      ip: capturarIp(headerList),
      user_agent: headerList.get('user-agent'),
      razon_social: d.razonSocial,
      nit: d.nit,
      rep_nombre: d.repNombre,
      rep_num_doc: d.repNumDoc,
    })
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
```

(Nota: `redirect` lanza; dejar el insert antes del `revalidatePath`/`redirect`. El insert de aceptación no debe abortar el guardado si falla por duplicado — la restricción idempotente ya lo previene; no envolver en throw.)

- [ ] **Step 2: Pasar `yaAceptoDatos` a la vista en `src/app/vinculacion/page.tsx`**

Consultar si el usuario ya aceptó la versión vigente y pasarlo al form como prop `yaAceptoDatos` para no exigir de nuevo la casilla en reediciones:

```ts
import { SLUG_ETAPA_VINCULACION, VERSION_LEGAL } from '@/lib/legal/documentos'
// …dentro del componente, junto a las demás queries:
const { data: aceptacionDatos } = await supabase
  .from('aceptaciones')
  .select('id')
  .eq('usuario_id', user.id)
  .eq('documento', SLUG_ETAPA_VINCULACION)
  .eq('version', VERSION_LEGAL)
  .maybeSingle()
// …pasar al form:
// <VinculacionForm … yaAceptoDatos={Boolean(aceptacionDatos)} />
```

- [ ] **Step 3: Añadir la casilla en `src/app/vinculacion/vinculacion-form.tsx`**

Agregar `yaAceptoDatos?: boolean` a las props del componente. Antes del botón de submit, insertar (solo cuando NO haya aceptado aún):

```tsx
import { documentoPorSlug } from '@/lib/legal/documentos'
// …
const docDatos = documentoPorSlug('tratamiento_datos')!
// …en el JSX, antes del botón:
{!yaAceptoDatos && (
  <label className="flex items-start gap-2 text-sm">
    <input type="checkbox" name="autorizacion_datos" className="mt-0.5" />
    <span>
      {docDatos.etiquetaCasilla}{' '}
      <a href="/legal/tratamiento_datos" target="_blank" className="text-primary hover:underline">
        Ver autorización
      </a>{' '}
      ·{' '}
      <a href="/legal/politica_tratamiento" target="_blank" className="text-primary hover:underline">
        Política de Tratamiento
      </a>
    </span>
  </label>
)}
```

- [ ] **Step 4: Verificar tipos y build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; `/vinculacion` compila.

- [ ] **Step 5: Commit**

```bash
git add src/app/vinculacion
git commit -m "feat(legal): aceptación de la autorización de datos en /vinculacion con snapshot (Habeas Data en etapa 2)"
```

---

### Task L6: Aceptación de los 6 documentos en `/contrato` (etapa 3)

**Files:**
- Modify: `src/app/contrato/actions.ts`
- Modify: `src/app/contrato/contrato-form.tsx`
- Modify: `src/app/contrato/page.tsx`
- Delete: `src/lib/legal/contrato.ts` (una vez que nadie lo importe)

Comportamiento: `/contrato` muestra los 6 documentos de etapa 3, cada uno en su bloque con scroll y su casilla. Submit deshabilitado hasta marcar las 6. Al enviar, se inserta una fila por documento aún no aceptado (idempotente por documento+versión), con snapshot de identidad tomado del perfil (ya completo y aprobado). El guard de la página redirige a `/dashboard` si ya aceptó las 6.

- [ ] **Step 1: Reescribir `src/app/contrato/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { capturarIp } from '@/lib/http/ip'
import { SLUGS_ETAPA_CONTRATO, VERSION_LEGAL } from '@/lib/legal/documentos'

export type ContratoState = { error: string | null }

export async function aceptarTerminos(
  _prev: ContratoState,
  formData: FormData
): Promise<ContratoState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('estado, razon_social, nit, rep_nombre, rep_num_doc')
    .eq('id', user.id)
    .single()

  if (perfil?.estado !== 'aprobado') {
    return { error: 'Solo puede aceptar los documentos una vez su empresa esté aprobada.' }
  }

  // Todas las casillas deben venir marcadas.
  const faltante = SLUGS_ETAPA_CONTRATO.some((slug) => formData.get(slug) !== 'on')
  if (faltante) {
    return { error: 'Debe aceptar todos los documentos para continuar.' }
  }

  // Idempotencia por documento + versión vigente.
  const { data: existentes } = await supabase
    .from('aceptaciones')
    .select('documento')
    .eq('usuario_id', user.id)
    .eq('version', VERSION_LEGAL)
    .in('documento', SLUGS_ETAPA_CONTRATO)

  const yaAceptados = new Set((existentes ?? []).map((a) => a.documento))

  const headerList = await headers()
  const ip = capturarIp(headerList)
  const userAgent = headerList.get('user-agent')

  const filas = SLUGS_ETAPA_CONTRATO.filter((slug) => !yaAceptados.has(slug)).map((slug) => ({
    usuario_id: user.id,
    documento: slug,
    version: VERSION_LEGAL,
    ip,
    user_agent: userAgent,
    razon_social: perfil.razon_social,
    nit: perfil.nit,
    rep_nombre: perfil.rep_nombre,
    rep_num_doc: perfil.rep_num_doc,
  }))

  if (filas.length > 0) {
    const { error } = await supabase.from('aceptaciones').insert(filas)
    if (error) return { error: 'No se pudo registrar la aceptación. Intente de nuevo.' }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
```

- [ ] **Step 2: Reescribir `src/app/contrato/contrato-form.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { aceptarTerminos, type ContratoState } from './actions'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { documentosPorEtapa } from '@/lib/legal/documentos'

const DOCS = documentosPorEtapa('contrato') // 6 documentos

export function ContratoForm() {
  const [state, formAction, pending] = useActionState<ContratoState, FormData>(
    aceptarTerminos,
    { error: null }
  )
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const todos = DOCS.every((d) => marcados[d.slug])

  return (
    <form action={formAction} className="grid gap-8">
      {DOCS.map((doc) => (
        <div key={doc.slug} className="grid gap-2">
          <h3 className="font-semibold">{doc.titulo}</h3>
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {doc.texto}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={doc.slug}
              checked={Boolean(marcados[doc.slug])}
              onChange={(e) =>
                setMarcados((m) => ({ ...m, [doc.slug]: e.target.checked }))
              }
              className="mt-0.5"
            />
            {doc.etiquetaCasilla}
          </label>
        </div>
      ))}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending || !todos} size="lg" className="w-fit">
        {pending ? 'Guardando…' : 'Aceptar y continuar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Actualizar el guard en `src/app/contrato/page.tsx`**

Reemplazar el uso de `CONTRATO_VERSION`/`TRATAMIENTO_VERSION` por la comprobación de que las 6 de etapa 3 ya están aceptadas en la versión vigente:

```ts
import { SLUGS_ETAPA_CONTRATO, VERSION_LEGAL } from '@/lib/legal/documentos'
// …dentro del componente, tras validar user y estado aprobado:
const { data: aceptadas } = await supabase
  .from('aceptaciones')
  .select('documento')
  .eq('usuario_id', user.id)
  .eq('version', VERSION_LEGAL)
  .in('documento', SLUGS_ETAPA_CONTRATO)

const completas = new Set((aceptadas ?? []).map((a) => a.documento)).size === SLUGS_ETAPA_CONTRATO.length
if (completas) redirect('/dashboard')
```

(Mantener los guards previos: sin user → `/login`; estado ≠ aprobado → `/dashboard`.)

- [ ] **Step 4: Eliminar `src/lib/legal/contrato.ts`**

Verificar que ya nadie lo importa y borrarlo:

Run: `grep -rn "lib/legal/contrato" src/ ; grep -rn "ES_BORRADOR\|CONTRATO_SERVICIOS\|TRATAMIENTO_DATOS\b" src/`
Expected: sin resultados en `src/` (todos migraron a `documentos.ts`/`textos.ts`). Luego: `git rm src/lib/legal/contrato.ts`.

- [ ] **Step 5: Verificar tipos, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/contrato` compila.

- [ ] **Step 6: Commit**

```bash
git add src/app/contrato src/lib/legal
git commit -m "feat(legal): /contrato acepta los 6 documentos de etapa 3 con snapshot; retira contrato.ts placeholder"
```

---

### Task L7: Dashboard + expediente admin reflejan los 7

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/admin/usuarios/[id]/page.tsx`

- [ ] **Step 1: Dashboard — el bloque de contrato refleja las 6 de etapa 3**

En `src/app/dashboard/page.tsx`, donde hoy se calcula `contratoAceptado`, cambiar a: aprobado + las 6 de etapa 3 aceptadas en versión vigente.

```ts
import { SLUGS_ETAPA_CONTRATO, VERSION_LEGAL } from '@/lib/legal/documentos'
// …
const { data: aceptadas } = await supabase
  .from('aceptaciones')
  .select('documento')
  .eq('usuario_id', user.id)
  .eq('version', VERSION_LEGAL)
  .in('documento', SLUGS_ETAPA_CONTRATO)

const contratoAceptado =
  new Set((aceptadas ?? []).map((a) => a.documento)).size === SLUGS_ETAPA_CONTRATO.length
```

Mantener el resto de la lógica del bloque (tarjeta «Falta un paso: acepte los documentos» que enlaza a `/contrato` cuando `estado==='aprobado' && !contratoAceptado`; «Documentos aceptados» cuando sí). Ajustar copy de «contrato» a «documentos legales» donde aplique.

- [ ] **Step 2: Admin — mostrar estado de los 7 documentos**

En `src/app/admin/usuarios/[id]/page.tsx`, reemplazar la consulta de contrato por todas las aceptaciones del usuario y renderizar el estado por documento:

```ts
import { DOCUMENTOS_LEGALES, VERSION_LEGAL } from '@/lib/legal/documentos'
// …
const { data: aceptaciones } = await supabase
  .from('aceptaciones')
  .select('documento, version, ip, created_at')
  .eq('usuario_id', id)

// map por slug de la versión vigente:
const aceptadoPorSlug = new Map(
  (aceptaciones ?? [])
    .filter((a) => a.version === VERSION_LEGAL)
    .map((a) => [a.documento, a])
)
```

Renderizar una lista de los 7 con «Aceptado el {fecha} · IP {ip}» o «Pendiente»:

```tsx
<section className="grid gap-1">
  <h3 className="font-semibold">Documentos legales</h3>
  <ul className="grid gap-1 text-sm">
    {DOCUMENTOS_LEGALES.map((d) => {
      const a = aceptadoPorSlug.get(d.slug)
      return (
        <li key={d.slug} className="flex justify-between gap-4">
          <span>{d.titulo}</span>
          <span className="text-muted-foreground">
            {a
              ? `Aceptado ${new Date(a.created_at).toLocaleDateString('es-CO')} · IP ${a.ip ?? '—'}`
              : 'Pendiente'}
          </span>
        </li>
      )
    })}
  </ul>
</section>
```

- [ ] **Step 3: Verificar tipos y build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/admin/usuarios/[id]/page.tsx
git commit -m "feat(legal): dashboard y expediente admin reflejan la aceptación de los 7 documentos"
```

---

### Task L8: Footer público, verificación final, docs y deploy

**Files:**
- Modify/Create: footer con enlaces a `/legal`
- Modify: `README.md`, `docs/CONTEXTO-PROYECTO.md`

- [ ] **Step 1: Enlaces públicos a los legales**

Localizar el footer/landing (`grep -rn "footer" src/app src/components`). Añadir un enlace «Documentos legales» → `/legal` y, si hay footer, enlaces directos a Términos, Política de Tratamiento y Aviso de Privacidad. Si no existe footer, añadir los enlaces en el pie de la landing (`src/app/page.tsx`).

- [ ] **Step 2: Verificación completa**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: tsc limpio; lint limpio; build OK con `/legal` y `/legal/[slug]`; todos los tests pasan (incluidos los nuevos de `documentos` e `ip`).

- [ ] **Step 3: Verificación en navegador (preview tools)**

Levantar el dev server (`preview_start` con el nombre de `.claude/launch.json`) y comprobar:
1. `/legal` lista los 7; cada `/legal/<slug>` renderiza el texto.
2. `/vinculacion` muestra la casilla de autorización de datos con enlaces a los legales.
3. `/contrato` (con un usuario aprobado) muestra 6 bloques + 6 casillas; el botón se habilita solo con las 6 marcadas.
Capturar screenshot de `/contrato` como evidencia.

- [ ] **Step 4: Actualizar documentación**

- `README.md` sección «Onboarding del PCD»: reemplazar la nota de `ES_BORRADOR` por: los 7 documentos viven en `src/lib/legal/documentos.ts` (versión `v1-2026-07`), se publican en `/legal`, la autorización de datos se acepta en `/vinculacion` (etapa 2) y los otros 6 en `/contrato` (etapa 3); cada aceptación es una fila inmutable con snapshot de identidad (migration `0005`).
- `docs/CONTEXTO-PROYECTO.md`: en «Pendiente explícito», marcar como hecho el punto de redactar los legales; anotar que quedan pendientes de revisión de abogado (los textos son borradores redactados, publicados como v1).

- [ ] **Step 5: Commit y push**

```bash
git add README.md docs/CONTEXTO-PROYECTO.md src/app
git commit -m "docs(legal): documenta el flujo de los 7 documentos legales y sus páginas públicas"
git push
```

- [ ] **Step 6: Confirmar deploy de Preview**

Confirmar que el último Preview de Vercel construyó OK y dar la URL a Jaime con checklist de prueba.

---

## Notas para Jaime (fuera del código)

1. **Correr la migration 0005** en Supabase SQL Editor antes de probar el Preview (igual que la 0004).
2. Los textos se publican como **v1 final** pero siguen siendo borradores redactados sin revisión de abogado. Puntos que conviene que un abogado confirme (ya identificados en los propios textos): clasificación Usuario profesional vs. consumidor (Ley 1480) para reembolsos, plazos de conservación concretos, y la cláusula de arbitraje con sede en Medellín.
3. Cuando el abogado apruebe/ajuste, se sube `VERSION_LEGAL` a `v2-…`, y el sistema pedirá re-aceptación automáticamente (la trazabilidad por versión ya lo soporta).

## Self-Review

- **Cobertura del spec:** 7 documentos como páginas públicas (L4) ✓; aceptación click-wrap individual con registro inmutable (L5 datos, L6 los 6) ✓; snapshot de identidad (L1 columnas, L5/L6 inserción) ✓; IP no falsificable reutilizada (L3) ✓; textos limpios sin meta-comentarios (L2) ✓; admin/dashboard reflejan estado (L7) ✓; migration del CHECK a 7 slugs (L1) ✓.
- **Placeholders:** los `…` en `textos.ts` (L2 Step 3) son instrucción de transcripción desde `docs/legales-borrador/*.txt` (archivos concretos en disco) con limpiezas enumeradas — no son «TODO» abiertos.
- **Consistencia de tipos:** `SlugLegal`, `SLUGS_ETAPA_CONTRATO`, `SLUG_ETAPA_VINCULACION`, `VERSION_LEGAL`, `capturarIp`, `documentoPorSlug`, `documentosPorEtapa` se definen en L2/L3 y se usan con las mismas firmas en L4–L7. `TipoAceptacion` (database.ts) y `SlugLegal` (documentos.ts) enumeran los mismos 7 slugs.
