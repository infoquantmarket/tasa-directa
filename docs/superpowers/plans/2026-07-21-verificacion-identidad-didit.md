# Verificación de Identidad del Representante Legal (Didit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Didit (proveedor de verificación de identidad) como cuarto requisito obligatorio en `/vinculacion`, para validar que el representante legal es quien dice ser (documento + prueba de vida + comparación facial), bloqueando la aprobación del PCD hasta que Didit confirme `Approved`.

**Architecture:** El PCD dispara la creación de una sesión de Didit desde `/vinculacion` (server action → `POST https://verification.didit.me/v3/session/`), se redirige al flujo alojado por Didit, y el resultado llega de forma asíncrona por webhook (`POST /api/webhooks/didit`, firmado con HMAC-SHA256 sobre JSON canónico ordenado). El estado se guarda en una tabla nueva `validaciones_identidad`; `puedeAprobarUsuario` se amplía para exigir `estado='Approved'` ahí, además de los 3 documentos ya requeridos.

**Tech Stack:** Next.js 16 App Router (Server Actions + Route Handler), TypeScript, Supabase (Postgres + RLS + `service_role` para el webhook), zod no aplica aquí (no hay formulario propio, solo botones), Vitest con mocking de `fetch`.

**Spec:** [`docs/superpowers/specs/2026-07-21-verificacion-identidad-didit-design.md`](../specs/2026-07-21-verificacion-identidad-didit-design.md)

---

## Contexto imprescindible para el ejecutor (sin memoria del proyecto)

- **Variables de entorno YA CARGADAS** en `.env.local` y en Vercel (Production/Preview/Development): `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`. No hay que pedirlas ni crearlas, ya existen.
- **Algoritmo EXACTO de `X-Signature-V2`** (verificado contra la documentación de Didit, no asumido):
  1. Parsear el body JSON.
  2. Ordenar alfabéticamente las claves de TODOS los objetos, en TODOS los niveles de anidación (los arrays mantienen su orden, solo se ordenan las claves de objetos).
  3. Serializar de nuevo a JSON compacto (sin espacios extra) preservando caracteres Unicode tal cual (JS ya hace esto por defecto con `JSON.stringify`, sin configuración especial).
  4. `HMAC-SHA256(DIDIT_WEBHOOK_SECRET, json_canonico)` en hexadecimal.
  5. Comparar contra el header `X-Signature-V2` con comparación en tiempo constante.
  6. Rechazar además si el header `X-Timestamp` (segundos Unix) difiere de la hora actual en más de 300 segundos.
- **El proveedor Didit NO se prueba con red real en los tests** — se usa `vi.stubGlobal('fetch', vi.fn())` de Vitest para simular las respuestas HTTP. Es el primer módulo del proyecto que llama a un `fetch` externo con tests; no hay un patrón previo que copiar (el único otro caso, `src/lib/telegram/notificar.ts`, no tiene tests).
- **Patrón de acciones "sin formulario real"**: como el botón "Verificar identidad" no envía campos de texto, se usa el mismo patrón que ya usan las acciones simples del admin (`<form action={accionBound}><input type="hidden".../></form>` o, aquí, un `<form>` sin campos, solo un botón submit) — ver `src/app/admin/usuarios/[id]/page.tsx` para el estilo.
- **RLS de `validaciones_identidad`**: el cliente SÍ puede insertar su propia fila inicial (con su propia sesión, vía `createClient()` normal), pero NO puede actualizarla — solo el webhook, corriendo con `service_role` (que sortea RLS), puede cambiar `estado`/`decision`. Esto requiere un cliente Supabase NUEVO con `service_role`, que este proyecto no tiene todavía (créase en este plan).
- Verificación estándar del proyecto: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`.

## File Structure

- **Create** `supabase/migrations/0006_verificacion_identidad.sql` — tabla `validaciones_identidad` + RLS.
- **Modify** `src/types/database.ts` — tipo `EstadoVerificacionIdentidad` + entrada de tabla.
- **Create** `src/lib/didit/firma.ts` — canonicalización JSON + verificación de firma HMAC (funciones puras).
- **Test** `tests/didit/firma.test.ts`.
- **Create** `src/lib/didit/cliente.ts` — `crearSesionVerificacion` (llama a la API de Didit) + `construirDetallesEsperados` (split de nombre).
- **Test** `tests/didit/cliente.test.ts`.
- **Create** `src/lib/supabase/service.ts` — cliente Supabase con `service_role`, para el webhook.
- **Create** `src/app/api/webhooks/didit/route.ts` — recibe y procesa el webhook de Didit.
- **Modify** `src/app/vinculacion/actions.ts` — nueva acción `iniciarVerificacionIdentidad`.
- **Create** `src/app/vinculacion/verificacion-identidad.tsx` — componente cliente con el botón/estado.
- **Modify** `src/app/vinculacion/page.tsx` — consulta el estado vigente y renderiza la nueva card.
- **Modify** `src/lib/validation/kyc.ts` — `puedeAprobarUsuario` exige también la verificación de identidad.
- **Modify** `src/app/admin/actions.ts` — `aprobarUsuario` consulta y pasa el nuevo requisito.
- **Modify** `src/app/admin/usuarios/[id]/page.tsx` — consulta el estado, lo muestra, y lo pasa a `puedeAprobarUsuario`.

---

### Task 1: Migration 0006 — tabla `validaciones_identidad`

**Files:**
- Create: `supabase/migrations/0006_verificacion_identidad.sql`

- [ ] **Step 1: Escribir la migration**

```sql
-- =============================================================================
-- TASA DIRECTA · Verificación de identidad del representante legal (Didit)
-- Idempotente.
-- =============================================================================

create table if not exists public.validaciones_identidad (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles_usuarios(id) on delete cascade,
  proveedor  text not null default 'didit',
  session_id text not null,
  estado     text not null default 'Not Started'
    check (estado in (
      'Not Started', 'In Progress', 'Approved', 'Declined', 'In Review',
      'Abandoned', 'Expired', 'Kyc Expired', 'Resubmitted', 'Awaiting User'
    )),
  decision   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_validaciones_identidad_usuario
  on public.validaciones_identidad(usuario_id, created_at desc);

create unique index if not exists uniq_validaciones_identidad_session
  on public.validaciones_identidad(session_id);

alter table public.validaciones_identidad enable row level security;

drop policy if exists "validaciones_identidad: leer propias" on public.validaciones_identidad;
create policy "validaciones_identidad: leer propias" on public.validaciones_identidad
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "validaciones_identidad: crear propias" on public.validaciones_identidad;
create policy "validaciones_identidad: crear propias" on public.validaciones_identidad
  for insert to authenticated with check (usuario_id = auth.uid());
-- No hay policy de update para el cliente autenticado: solo el webhook,
-- corriendo con service_role (que sortea RLS), puede cambiar estado/decision
-- después de creada la fila.
```

- [ ] **Step 2: Verificar que el archivo quedó bien escrito**

Run: `cat supabase/migrations/0006_verificacion_identidad.sql`
Expected: el contenido de arriba. (La aplicación real la corre Jaime en Supabase SQL Editor — no hay CLI local de Supabase en este entorno.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_verificacion_identidad.sql
git commit -m "feat(db): migration 0006 — tabla validaciones_identidad (Didit)"
```

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Agregar el tipo `EstadoVerificacionIdentidad`**

Después de la línea `export type TipoAceptacion = ...` (justo antes de `export interface Database {`), agregar:

```ts
export type EstadoVerificacionIdentidad =
  | 'Not Started' | 'In Progress' | 'Approved' | 'Declined' | 'In Review'
  | 'Abandoned' | 'Expired' | 'Kyc Expired' | 'Resubmitted' | 'Awaiting User'
```

- [ ] **Step 2: Agregar la entrada de tabla**

Dentro de `Database['public']['Tables']`, justo después del bloque `aceptaciones: { ... }` (antes del `}` que cierra `Tables`), agregar:

```ts
      validaciones_identidad: {
        Row: {
          id:         string
          usuario_id: string
          proveedor:  string
          session_id: string
          estado:     EstadoVerificacionIdentidad
          decision:   Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          usuario_id: string
          proveedor?: string
          session_id: string
          estado?: EstadoVerificacionIdentidad
        }
        Update: {
          estado?: EstadoVerificacionIdentidad
          decision?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores (nada más usa este tipo todavía, así que no debe cambiar nada más).

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(didit): tipos de validaciones_identidad"
```

---

### Task 3: Canonicalización JSON y verificación de firma (TDD)

**Files:**
- Create: `src/lib/didit/firma.ts`
- Test: `tests/didit/firma.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/didit/firma.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { canonicalizarJson, verificarFirmaWebhook } from '@/lib/didit/firma'

describe('canonicalizarJson', () => {
  it('ordena las claves de un objeto simple', () => {
    expect(canonicalizarJson('{"b":1,"a":2}')).toBe('{"a":2,"b":1}')
  })

  it('ordena las claves recursivamente, en todos los niveles', () => {
    const entrada = '{"b":{"z":1,"a":2},"a":3}'
    expect(canonicalizarJson(entrada)).toBe('{"a":3,"b":{"a":2,"z":1}}')
  })

  it('mantiene el orden de los elementos dentro de arrays', () => {
    const entrada = '{"a":[{"b":2,"a":1},{"d":4,"c":3}]}'
    expect(canonicalizarJson(entrada)).toBe('{"a":[{"a":1,"b":2},{"c":3,"d":4}]}')
  })

  it('preserva caracteres unicode sin escaparlos', () => {
    expect(canonicalizarJson('{"nombre":"José"}')).toBe('{"nombre":"José"}')
  })

  it('produce el mismo resultado sin importar el orden de entrada', () => {
    const a = canonicalizarJson('{"session_id":"abc","status":"Approved"}')
    const b = canonicalizarJson('{"status":"Approved","session_id":"abc"}')
    expect(a).toBe(b)
  })
})

describe('verificarFirmaWebhook', () => {
  const secreto = 'secreto-de-prueba'
  const cuerpoRaw = '{"status":"Approved","session_id":"abc123"}'
  const canonico = canonicalizarJson(cuerpoRaw)
  const firmaValida = createHmac('sha256', secreto).update(canonico).digest('hex')
  const ahora = 1_700_000_000

  it('acepta una firma válida dentro de la ventana de tiempo', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora,
    })
    expect(resultado).toBe(true)
  })

  it('rechaza una firma incorrecta', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: 'firma-incorrecta',
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora,
    })
    expect(resultado).toBe(false)
  })

  it('rechaza si el timestamp está fuera de la ventana de 300 segundos', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora + 301,
    })
    expect(resultado).toBe(false)
  })

  it('acepta justo en el límite de 300 segundos', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto,
      ahoraSegundos: ahora + 300,
    })
    expect(resultado).toBe(true)
  })

  it('rechaza si el secreto no coincide', () => {
    const resultado = verificarFirmaWebhook({
      cuerpoRaw,
      firmaV2: firmaValida,
      timestamp: ahora,
      secreto: 'otro-secreto',
      ahoraSegundos: ahora,
    })
    expect(resultado).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/didit/firma.test.ts`
Expected: FAIL — módulo `@/lib/didit/firma` no encontrado.

- [ ] **Step 3: Crear `src/lib/didit/firma.ts`**

```ts
import { createHmac, timingSafeEqual } from 'crypto'

const VENTANA_SEGUNDOS_MAX = 300

function ordenarClaves(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(ordenarClaves)
  }
  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor as Record<string, unknown>).sort()
    const resultado: Record<string, unknown> = {}
    for (const clave of claves) {
      resultado[clave] = ordenarClaves((valor as Record<string, unknown>)[clave])
    }
    return resultado
  }
  return valor
}

/**
 * Reproduce el "JSON canónico" que exige Didit para X-Signature-V2: claves
 * ordenadas alfabéticamente en todos los niveles, serializado de forma
 * compacta (sin espacios) y con caracteres Unicode sin escapar — que es
 * exactamente lo que hace `JSON.stringify` de JavaScript por defecto.
 */
export function canonicalizarJson(cuerpoRaw: string): string {
  const parsed: unknown = JSON.parse(cuerpoRaw)
  return JSON.stringify(ordenarClaves(parsed))
}

/**
 * Verifica la firma X-Signature-V2 de un webhook de Didit: HMAC-SHA256 sobre
 * el JSON canónico, comparación en tiempo constante, y una ventana de 300
 * segundos de tolerancia sobre X-Timestamp para evitar ataques de repetición.
 */
export function verificarFirmaWebhook(input: {
  cuerpoRaw: string
  firmaV2: string
  timestamp: number
  secreto: string
  ahoraSegundos?: number
}): boolean {
  const ahora = input.ahoraSegundos ?? Math.floor(Date.now() / 1000)
  if (Math.abs(ahora - input.timestamp) > VENTANA_SEGUNDOS_MAX) return false

  const canonico = canonicalizarJson(input.cuerpoRaw)
  const esperada = createHmac('sha256', input.secreto).update(canonico).digest('hex')

  const bufEsperada = Buffer.from(esperada)
  const bufRecibida = Buffer.from(input.firmaV2)
  if (bufEsperada.length !== bufRecibida.length) return false
  return timingSafeEqual(bufEsperada, bufRecibida)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/didit/firma.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/didit/firma.ts tests/didit/firma.test.ts
git commit -m "feat(didit): canonicalización JSON y verificación de firma del webhook (TDD)"
```

---

### Task 4: Cliente Didit — crear sesión de verificación (TDD)

**Files:**
- Create: `src/lib/didit/cliente.ts`
- Test: `tests/didit/cliente.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/didit/cliente.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { construirDetallesEsperados, crearSesionVerificacion } from '@/lib/didit/cliente'

describe('construirDetallesEsperados', () => {
  it('divide un nombre de dos palabras en first_name y last_name', () => {
    expect(construirDetallesEsperados('Juan Pérez')).toEqual({
      first_name: 'Juan',
      last_name: 'Pérez',
    })
  })

  it('deja last_name vacío si solo hay una palabra', () => {
    expect(construirDetallesEsperados('Juan')).toEqual({
      first_name: 'Juan',
      last_name: '',
    })
  })

  it('junta todo lo que sigue al primer espacio en last_name', () => {
    expect(construirDetallesEsperados('Juan Carlos Pérez Gómez')).toEqual({
      first_name: 'Juan',
      last_name: 'Carlos Pérez Gómez',
    })
  })

  it('recorta espacios sobrantes', () => {
    expect(construirDetallesEsperados('  Juan   Pérez  ')).toEqual({
      first_name: 'Juan',
      last_name: 'Pérez',
    })
  })
})

describe('crearSesionVerificacion', () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env.DIDIT_API_KEY = 'test-api-key'
    process.env.DIDIT_WORKFLOW_ID = 'workflow-123'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...original }
  })

  it('llama a la API de Didit con la URL, headers y body correctos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess_1', url: 'https://verify.didit.me/x' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await crearSesionVerificacion({
      usuarioId: 'user-1',
      repNombre: 'Juan Pérez',
      callback: 'https://tasadirecta.com/vinculacion',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://verification.didit.me/v3/session/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
      })
    )

    const cuerpoEnviado = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(cuerpoEnviado).toEqual({
      workflow_id: 'workflow-123',
      vendor_data: 'user-1',
      callback: 'https://tasadirecta.com/vinculacion',
      expected_details: {
        first_name: 'Juan',
        last_name: 'Pérez',
        id_country: 'CO',
        expected_document_types: ['id_card'],
      },
    })
  })

  it('devuelve sessionId y url de la respuesta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess_42', url: 'https://verify.didit.me/y' }),
    }))

    const resultado = await crearSesionVerificacion({
      usuarioId: 'user-1',
      repNombre: 'Ana Gómez',
      callback: 'https://tasadirecta.com/vinculacion',
    })

    expect(resultado).toEqual({ sessionId: 'sess_42', url: 'https://verify.didit.me/y' })
  })

  it('lanza un error si la respuesta no es exitosa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    }))

    await expect(
      crearSesionVerificacion({
        usuarioId: 'user-1',
        repNombre: 'Ana Gómez',
        callback: 'https://tasadirecta.com/vinculacion',
      })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/didit/cliente.test.ts`
Expected: FAIL — módulo `@/lib/didit/cliente` no encontrado.

- [ ] **Step 3: Crear `src/lib/didit/cliente.ts`**

```ts
const DIDIT_SESSION_URL = 'https://verification.didit.me/v3/session/'

export interface CrearSesionInput {
  usuarioId: string
  repNombre: string
  callback: string
}

export interface SesionVerificacion {
  sessionId: string
  url: string
}

/**
 * Divide el nombre completo del representante legal en first_name/last_name
 * para el campo `expected_details` de Didit: todo antes del primer espacio
 * es el nombre, el resto es el apellido. Si no hay espacio, el apellido
 * queda vacío — es una aproximación simple, no un análisis de nombres.
 */
export function construirDetallesEsperados(repNombre: string): { first_name: string; last_name: string } {
  const nombre = repNombre.trim().replace(/\s+/g, ' ')
  const espacio = nombre.indexOf(' ')
  if (espacio === -1) return { first_name: nombre, last_name: '' }
  return { first_name: nombre.slice(0, espacio), last_name: nombre.slice(espacio + 1) }
}

/**
 * Crea una sesión de verificación de identidad en Didit para el
 * representante legal. El resultado NO llega en esta llamada — llega
 * después por webhook (ver src/app/api/webhooks/didit/route.ts).
 */
export async function crearSesionVerificacion(input: CrearSesionInput): Promise<SesionVerificacion> {
  const { first_name, last_name } = construirDetallesEsperados(input.repNombre)

  const respuesta = await fetch(DIDIT_SESSION_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.DIDIT_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: process.env.DIDIT_WORKFLOW_ID,
      vendor_data: input.usuarioId,
      callback: input.callback,
      expected_details: {
        first_name,
        last_name,
        id_country: 'CO',
        expected_document_types: ['id_card'],
      },
    }),
  })

  if (!respuesta.ok) {
    throw new Error(`Didit respondió con estado ${respuesta.status} al crear la sesión`)
  }

  const data = (await respuesta.json()) as { session_id: string; url: string }
  return { sessionId: data.session_id, url: data.url }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/didit/cliente.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/didit/cliente.ts tests/didit/cliente.test.ts
git commit -m "feat(didit): cliente para crear sesión de verificación de identidad (TDD)"
```

---

### Task 5: Cliente Supabase con `service_role`

**Files:**
- Create: `src/lib/supabase/service.ts`

- [ ] **Step 1: Crear el archivo**

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Cliente con `service_role`: sortea RLS por completo. Úsese SOLO en rutas
 * de servidor sin sesión de usuario (webhooks de proveedores externos como
 * Didit o Bold) — nunca para responder a una request de un cliente
 * autenticado normal, donde corresponde `src/lib/supabase/server.ts`.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/service.ts
git commit -m "feat(supabase): cliente service_role para webhooks de proveedores externos"
```

---

### Task 6: Webhook `POST /api/webhooks/didit`

**Files:**
- Create: `src/app/api/webhooks/didit/route.ts`

- [ ] **Step 1: Crear la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verificarFirmaWebhook } from '@/lib/didit/firma'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  const cuerpoRaw = await request.text()
  const firmaV2 = request.headers.get('x-signature-v2')
  const timestampHeader = request.headers.get('x-timestamp')

  if (!firmaV2 || !timestampHeader) {
    return NextResponse.json({ ok: false, error: 'Faltan cabeceras de firma' }, { status: 401 })
  }

  const timestamp = Number(timestampHeader)
  const secreto = process.env.DIDIT_WEBHOOK_SECRET
  if (!secreto || Number.isNaN(timestamp)) {
    return NextResponse.json({ ok: false, error: 'Configuración inválida' }, { status: 401 })
  }

  const valido = verificarFirmaWebhook({ cuerpoRaw, firmaV2, timestamp, secreto })
  if (!valido) {
    return NextResponse.json({ ok: false, error: 'Firma inválida' }, { status: 401 })
  }

  let payload: { session_id?: string; status?: string; decision?: unknown }
  try {
    payload = JSON.parse(cuerpoRaw)
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const { session_id: sessionId, status: estado, decision } = payload
  if (!sessionId || !estado) {
    // Envelope inesperado (p. ej. un tipo de evento que no nos interesa).
    // Respondemos 200 para que Didit no reintente indefinidamente.
    return NextResponse.json({ ok: true })
  }

  const supabase = createServiceClient()
  await supabase
    .from('validaciones_identidad')
    .update({
      estado: estado as never,
      decision: (decision ?? null) as never,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)

  return NextResponse.json({ ok: true })
}
```

Nota: los `as never` en `estado`/`decision` son necesarios porque el tipo
`Update` de `validaciones_identidad` usa el enum estricto
`EstadoVerificacionIdentidad` y `Json`, pero el payload del webhook llega
como `string`/`unknown` sin tipar (viene de una API externa) — no hay forma
de que TypeScript valide en tiempo de compilación que Didit envía uno de los
10 valores esperados. Es un patrón aceptado para bordes con datos externos
no tipados; no usar `as never` en ningún otro lugar del código nuevo de este
plan.

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/api/webhooks/didit` aparece en la lista de rutas.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/didit/route.ts
git commit -m "feat(didit): webhook que recibe el resultado de la verificación de identidad"
```

---

### Task 7: Server action `iniciarVerificacionIdentidad`

**Files:**
- Modify: `src/app/vinculacion/actions.ts`

Contenido actual completo del archivo (ninguna línea de esto cambia — solo
se agrega código nuevo, ver Steps 1 y 2):

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { perfilSchema } from '@/lib/validation/perfil'
import { headers } from 'next/headers'
import { capturarIp } from '@/lib/http/ip'
import { SLUG_ETAPA_VINCULACION, VERSION_LEGAL } from '@/lib/legal/documentos'

export type PerfilState = { error: string | null; valores?: Record<string, string> }

const CAMPOS_FORM = [
  'razonSocial', 'nombreComercial', 'nit', 'tipoSociedad', 'sede', 'direccion', 'ciudad',
  'telefono', 'sitioWeb', 'repNombre', 'repTipoDoc', 'repNumDoc', 'repCorreo', 'repCelular',
  'contactoNombre', 'contactoCargo', 'contactoCelular', 'contactoCorreo', 'contactoWhatsapp',
] as const

function valoresDesdeFormData(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {}
  for (const campo of CAMPOS_FORM) {
    valores[campo] = String(formData.get(campo) ?? '')
  }
  return valores
}

export async function guardarPerfil(
  _prev: PerfilState,
  formData: FormData
): Promise<PerfilState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const crudo = Object.fromEntries(CAMPOS_FORM.map((c) => [c, formData.get(c) ?? '']))
  const parsed = perfilSchema.safeParse(crudo)

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, valores: valoresDesdeFormData(formData) }
  }

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

  const { error } = await supabase
    .from('perfiles_usuarios')
    .update({
      razon_social: d.razonSocial,
      nombre_comercial: d.nombreComercial || null,
      nit: d.nit,
      tipo_sociedad: d.tipoSociedad,
      sede: d.sede,
      direccion: d.direccion,
      ciudad: d.ciudad,
      telefono: d.telefono || null,
      sitio_web: d.sitioWeb || null,
      rep_nombre: d.repNombre,
      rep_tipo_doc: d.repTipoDoc,
      rep_num_doc: d.repNumDoc,
      rep_correo: d.repCorreo,
      rep_celular: d.repCelular,
      contacto_nombre: d.contactoNombre,
      contacto_cargo: d.contactoCargo || null,
      contacto_celular: d.contactoCelular,
      contacto_correo: d.contactoCorreo,
      whatsapp: d.contactoWhatsapp || null,
      perfil_completo: true,
    })
    .eq('id', user.id)

  if (error) {
    return { error: 'No se pudo guardar el perfil. Intente de nuevo.', valores: valoresDesdeFormData(formData) }
  }

  if (!yaAcepto) {
    const headerList = await headers()
    const { error: errorAceptacion } = await supabase.from('aceptaciones').insert({
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
    if (errorAceptacion) {
      return {
        error: 'Se guardó el perfil, pero no se pudo registrar la autorización de datos. Intente guardar de nuevo.',
        valores: valoresDesdeFormData(formData),
      }
    }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
```

- [ ] **Step 1: Agregar el import del cliente Didit**

Al inicio del archivo, junto a los demás imports, agregar:

```ts
import { crearSesionVerificacion } from '@/lib/didit/cliente'
import { construirOrigin } from '@/lib/http/origin'
```

- [ ] **Step 2: Agregar la nueva acción al final del archivo**

Después de la función `guardarPerfil` (que termina con `redirect('/dashboard')` y su `}` de cierre), agregar:

```ts
export type VerificacionIdentidadState = { error: string | null }

export async function iniciarVerificacionIdentidad(
  _prev: VerificacionIdentidadState,
  _formData: FormData
): Promise<VerificacionIdentidadState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rep_nombre, rep_tipo_doc, rep_num_doc')
    .eq('id', user.id)
    .single()

  if (!perfil?.rep_nombre || !perfil?.rep_tipo_doc || !perfil?.rep_num_doc) {
    return { error: 'Guarde primero los datos del representante legal en el perfil.' }
  }

  const headerList = await headers()
  const origin = construirOrigin(headerList)

  let sesion: { sessionId: string; url: string }
  try {
    sesion = await crearSesionVerificacion({
      usuarioId: user.id,
      repNombre: perfil.rep_nombre,
      callback: `${origin}/vinculacion`,
    })
  } catch {
    return { error: 'No se pudo iniciar la verificación de identidad. Intente de nuevo.' }
  }

  const { error } = await supabase.from('validaciones_identidad').insert({
    usuario_id: user.id,
    session_id: sesion.sessionId,
  })

  if (error) {
    return { error: 'No se pudo registrar la verificación. Intente de nuevo.' }
  }

  redirect(sesion.url)
}
```

- [ ] **Step 3: Verificar tipos, lint y tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sin errores nuevos; los tests existentes (incluidos los nuevos de `didit/firma` y `didit/cliente`) siguen pasando.

- [ ] **Step 4: Commit**

```bash
git add "src/app/vinculacion/actions.ts"
git commit -m "feat(didit): server action iniciarVerificacionIdentidad en /vinculacion"
```

---

### Task 8: Card de verificación de identidad en `/vinculacion`

**Files:**
- Create: `src/app/vinculacion/verificacion-identidad.tsx`
- Modify: `src/app/vinculacion/page.tsx`

- [ ] **Step 1: Crear `src/app/vinculacion/verificacion-identidad.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { iniciarVerificacionIdentidad, type VerificacionIdentidadState } from './actions'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import type { EstadoVerificacionIdentidad } from '@/types/database'

const ESTADOS_EN_PROCESO: EstadoVerificacionIdentidad[] = [
  'Not Started', 'In Progress', 'Awaiting User', 'Resubmitted',
]
const ESTADOS_RECHAZADOS: EstadoVerificacionIdentidad[] = [
  'Declined', 'Abandoned', 'Expired', 'Kyc Expired',
]

export function VerificacionIdentidad({
  estado,
  repCompleto,
}: {
  estado: EstadoVerificacionIdentidad | null
  repCompleto: boolean
}) {
  const [state, formAction, pending] = useActionState<VerificacionIdentidadState, FormData>(
    iniciarVerificacionIdentidad,
    { error: null }
  )

  if (estado === 'Approved') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" />
        Identidad del representante legal verificada.
      </p>
    )
  }

  if (estado === 'In Review') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4 text-primary" />
        Verificación en revisión por Didit.
      </p>
    )
  }

  if (estado && ESTADOS_EN_PROCESO.includes(estado)) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4 text-primary" />
        Verificación en proceso. Si el representante legal aún no completó el
        flujo, puede continuar desde el enlace que se abrió al iniciarla.
      </p>
    )
  }

  return (
    <div className="grid gap-3">
      {estado && ESTADOS_RECHAZADOS.includes(estado) && (
        <p className="flex items-center gap-1.5 text-sm text-red-700">
          <XCircle className="size-4" />
          La verificación anterior no se completó o fue rechazada. Puede intentar de nuevo.
        </p>
      )}
      {!repCompleto && (
        <p className="text-sm text-muted-foreground">
          Guarde primero los datos del representante legal (arriba) para
          poder iniciar la verificación.
        </p>
      )}
      <form action={formAction}>
        {state.error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending || !repCompleto}>
          {pending ? 'Iniciando…' : 'Verificar identidad'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Modificar `src/app/vinculacion/page.tsx`**

Contenido actual completo del archivo (ninguna línea de esto cambia excepto
las 3 marcadas explícitamente abajo):

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EstadoBadge } from '@/components/estado-badge'
import { DocumentoUploader } from '@/app/dashboard/documento-uploader'
import { VinculacionForm } from './vinculacion-form'
import {
  TODOS_TIPOS_DOCUMENTO,
  ETIQUETAS_DOCUMENTO,
  DESCRIPCIONES_DOCUMENTO,
} from '@/lib/validation/kyc'
import { SLUG_ETAPA_VINCULACION, VERSION_LEGAL } from '@/lib/legal/documentos'
import { Lock } from 'lucide-react'

export const metadata: Metadata = { title: 'Vinculación de la empresa' }

export default async function VinculacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: perfil }, { data: docs }, { data: aceptacionDatos }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', user.id),
    supabase
      .from('aceptaciones')
      .select('id')
      .eq('usuario_id', user.id)
      .eq('documento', SLUG_ETAPA_VINCULACION)
      .eq('version', VERSION_LEGAL)
      .maybeSingle(),
  ])

  if (!perfil) redirect('/login')

  const valoresIniciales: Record<string, string> = {
    razonSocial: perfil.razon_social ?? '',
    nombreComercial: perfil.nombre_comercial ?? '',
    nit: perfil.nit ?? '',
    tipoSociedad: perfil.tipo_sociedad ?? '',
    sede: perfil.sede ?? '',
    direccion: perfil.direccion ?? '',
    ciudad: perfil.ciudad ?? '',
    telefono: perfil.telefono ?? '',
    sitioWeb: perfil.sitio_web ?? '',
    repNombre: perfil.rep_nombre ?? '',
    repTipoDoc: perfil.rep_tipo_doc ?? '',
    repNumDoc: perfil.rep_num_doc ?? '',
    repCorreo: perfil.rep_correo ?? '',
    repCelular: perfil.rep_celular ?? '',
    contactoNombre: perfil.contacto_nombre ?? '',
    contactoCargo: perfil.contacto_cargo ?? '',
    contactoCelular: perfil.contacto_celular ?? '',
    contactoCorreo: perfil.contacto_correo ?? '',
    contactoWhatsapp: perfil.whatsapp ?? '',
  }

  const documentos = TODOS_TIPOS_DOCUMENTO.map((tipo) => ({
    tipo,
    doc: docs?.find((d) => d.tipo_documento === tipo) ?? null,
  }))

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vinculación de la empresa</h1>
            <p className="text-sm text-muted-foreground">
              Complete el perfil de su empresa y cargue los documentos requeridos.
            </p>
          </div>
          <EstadoBadge estado={perfil.estado} />
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-accent/40 p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            La documentación e información que suministre es <strong>confidencial</strong>.
            Solo se usa para validar la identidad de su empresa y dar seguridad a los
            demás usuarios de la plataforma. No se comparte con terceros.
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">Perfil de la empresa</CardTitle>
            <CardDescription>
              Puede guardar el perfil y subir los documentos en cualquier orden; ambos
              son necesarios para la revisión.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VinculacionForm valoresIniciales={valoresIniciales} yaAceptoDatos={Boolean(aceptacionDatos)} />
          </CardContent>
        </Card>

        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">Documentos</h2>
          {documentos.map(({ tipo, doc }) => (
            <Card key={tipo}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{ETIQUETAS_DOCUMENTO[tipo]}</CardTitle>
                  <CardDescription>{DESCRIPCIONES_DOCUMENTO[tipo]}</CardDescription>
                </div>
                {doc && <EstadoBadge estado={doc.estado} />}
              </CardHeader>
              <CardContent className="grid gap-3">
                {doc?.estado === 'rechazado' && doc.notas_revision && (
                  <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Motivo del rechazo: {doc.notas_revision}
                  </p>
                )}
                {doc?.estado === 'aprobado' ? (
                  <p className="text-sm text-muted-foreground">
                    Documento aprobado{doc.nombre_archivo ? `: ${doc.nombre_archivo}` : ''}.
                  </p>
                ) : (
                  <>
                    {doc && (
                      <p className="text-sm text-muted-foreground">
                        Archivo actual: {doc.nombre_archivo ?? doc.storage_path}
                      </p>
                    )}
                    <DocumentoUploader
                      tipo={tipo}
                      usuarioId={user.id}
                      esReemplazo={Boolean(doc)}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </>
  )
}
```

Aplicar estos 3 cambios exactos:

**(a) Agregar el import del componente y del tipo**, junto a los demás imports:

```ts
import { VerificacionIdentidad } from './verificacion-identidad'
import type { EstadoVerificacionIdentidad } from '@/types/database'
```

**(b) Agregar una cuarta consulta al `Promise.all`**, y renombrar la desestructuración para incluirla. Reemplazar:

```ts
  const [{ data: perfil }, { data: docs }, { data: aceptacionDatos }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', user.id),
    supabase
      .from('aceptaciones')
      .select('id')
      .eq('usuario_id', user.id)
      .eq('documento', SLUG_ETAPA_VINCULACION)
      .eq('version', VERSION_LEGAL)
      .maybeSingle(),
  ])
```

por:

```ts
  const [{ data: perfil }, { data: docs }, { data: aceptacionDatos }, { data: verificacion }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', user.id),
    supabase
      .from('aceptaciones')
      .select('id')
      .eq('usuario_id', user.id)
      .eq('documento', SLUG_ETAPA_VINCULACION)
      .eq('version', VERSION_LEGAL)
      .maybeSingle(),
    supabase
      .from('validaciones_identidad')
      .select('estado')
      .eq('usuario_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
```

**(c) Agregar la nueva sección**, justo después de la sección `<section className="grid gap-4">...Documentos...</section>` y antes del `</main>`:

```tsx
        <section className="mt-8 grid gap-4">
          <h2 className="text-lg font-semibold">Verificación de identidad</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Representante legal</CardTitle>
              <CardDescription>
                Confirmamos la identidad del representante legal con un
                proveedor externo (documento + prueba de vida).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VerificacionIdentidad
                estado={(verificacion?.estado ?? null) as EstadoVerificacionIdentidad | null}
                repCompleto={Boolean(perfil.rep_nombre && perfil.rep_tipo_doc && perfil.rep_num_doc)}
              />
            </CardContent>
          </Card>
        </section>
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/vinculacion` sigue compilando.

- [ ] **Step 4: Commit**

```bash
git add src/app/vinculacion
git commit -m "feat(didit): card de verificación de identidad en /vinculacion"
```

---

### Task 9: Gating de aprobación — `puedeAprobarUsuario` + admin

**Files:**
- Modify: `src/lib/validation/kyc.ts`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/usuarios/[id]/page.tsx`
- Modify: `tests/validation/kyc.test.ts`

- [ ] **Step 1: Modificar `puedeAprobarUsuario` en `src/lib/validation/kyc.ts`**

Reemplazar:

```ts
/** La aprobación final del PCD solo se habilita con los 3 documentos REQUERIDOS aprobados. */
export function puedeAprobarUsuario(
  docs: Array<{ tipo_documento: TipoDoc; estado: EstadoDoc }>
): boolean {
  return TIPOS_DOCUMENTO.every((tipo) =>
    docs.some((d) => d.tipo_documento === tipo && d.estado === 'aprobado')
  )
}
```

por:

```ts
/**
 * La aprobación final del PCD requiere los 3 documentos REQUERIDOS
 * aprobados Y que la verificación de identidad del representante legal
 * (Didit) esté en estado 'Approved'.
 */
export function puedeAprobarUsuario(
  docs: Array<{ tipo_documento: TipoDoc; estado: EstadoDoc }>,
  verificacionIdentidad: { estado: string } | null | undefined
): boolean {
  const docsOk = TIPOS_DOCUMENTO.every((tipo) =>
    docs.some((d) => d.tipo_documento === tipo && d.estado === 'aprobado')
  )
  return docsOk && verificacionIdentidad?.estado === 'Approved'
}
```

- [ ] **Step 2: Actualizar el bloque `describe('puedeAprobarUsuario', ...)` en `tests/validation/kyc.test.ts`**

El archivo completo hoy es:

```ts
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
```

Reemplazar el bloque `describe('puedeAprobarUsuario', ...)` completo (las
últimas 21 líneas de arriba) por:

```ts
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
```

El resto del archivo (`describe('constantes KYC', ...)` y
`describe('validarArchivoKyc', ...)`) no cambia.

- [ ] **Step 3: Correr los tests de validación**

Run: `npm test -- tests/validation/kyc.test.ts`
Expected: PASS (todos, incluidos los actualizados).

- [ ] **Step 4: Modificar `src/app/admin/actions.ts`**

Dentro de `aprobarUsuario`, reemplazar:

```ts
  const { data: docs } = await supabase
    .from('documentos_kyc')
    .select('tipo_documento, estado')
    .eq('usuario_id', usuarioId)

  if (!puedeAprobarUsuario(docs ?? [])) {
    return { error: 'No se puede aprobar: los 3 documentos deben estar aprobados primero.' }
  }
```

por:

```ts
  const { data: docs } = await supabase
    .from('documentos_kyc')
    .select('tipo_documento, estado')
    .eq('usuario_id', usuarioId)

  const { data: verificacion } = await supabase
    .from('validaciones_identidad')
    .select('estado')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!puedeAprobarUsuario(docs ?? [], verificacion)) {
    return {
      error: 'No se puede aprobar: los 3 documentos y la verificación de identidad del representante legal deben estar aprobados primero.',
    }
  }
```

- [ ] **Step 5: Modificar `src/app/admin/usuarios/[id]/page.tsx`**

Agregar una quinta consulta al `Promise.all` existente. Reemplazar:

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: movimientos }, { data: aceptaciones }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', id),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', id).maybeSingle(),
    supabase.from('token_movimientos')
      .select('id, delta, concepto, nota, created_at')
      .eq('usuario_id', id).order('created_at', { ascending: false }).limit(5),
    supabase.from('aceptaciones').select('documento, version, ip, created_at')
      .eq('usuario_id', id),
  ])
```

por:

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: movimientos }, { data: aceptaciones }, { data: verificacionIdentidad }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', id),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', id).maybeSingle(),
    supabase.from('token_movimientos')
      .select('id, delta, concepto, nota, created_at')
      .eq('usuario_id', id).order('created_at', { ascending: false }).limit(5),
    supabase.from('aceptaciones').select('documento, version, ip, created_at')
      .eq('usuario_id', id),
    supabase.from('validaciones_identidad').select('estado, created_at')
      .eq('usuario_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
```

Reemplazar la línea que calcula `listo`:

```ts
  const listo = puedeAprobarUsuario(
    (docs ?? []).map((d) => ({ tipo_documento: d.tipo_documento, estado: d.estado }))
  )
```

por:

```ts
  const listo = puedeAprobarUsuario(
    (docs ?? []).map((d) => ({ tipo_documento: d.tipo_documento, estado: d.estado })),
    verificacionIdentidad
  )
```

Agregar una fila de solo lectura con el estado de Didit, dentro de la
sección `<section className="grid gap-1 rounded-lg border border-border bg-white p-6">Documentos legales...</section>`
ya existente: justo después de esa sección (antes de la sección
`<section className="grid gap-4">Documentos...</section>` de KYC), agregar:

```tsx
      <section className="grid gap-1 rounded-lg border border-border bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold">Verificación de identidad (Didit)</h2>
        <p className="text-sm">
          Representante legal:{' '}
          <span className="text-muted-foreground">
            {verificacionIdentidad
              ? `${verificacionIdentidad.estado} · ${new Date(verificacionIdentidad.created_at).toLocaleDateString('es-CO')}`
              : 'Aún no iniciada'}
          </span>
        </p>
      </section>
```

Actualizar también el texto de ayuda del botón "Aprobar PCD" (bajo `!listo`):
reemplazar

```tsx
            {!listo && (
              <p className="mt-2 text-sm text-muted-foreground">
                Se habilita cuando los 3 documentos estén aprobados.
              </p>
            )}
```

por:

```tsx
            {!listo && (
              <p className="mt-2 text-sm text-muted-foreground">
                Se habilita cuando los 3 documentos y la verificación de
                identidad del representante legal estén aprobados.
              </p>
            )}
```

- [ ] **Step 6: Verificar tipos, lint, tests y build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: todo limpio; `puedeAprobarUsuario` usado consistentemente con 2 argumentos en ambos call sites.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/kyc.ts src/app/admin/actions.ts "src/app/admin/usuarios/[id]/page.tsx" tests/validation/kyc.test.ts
git commit -m "feat(didit): exige la verificación de identidad para aprobar al PCD"
```

---

### Task 10: Verificación final, docs y deploy

**Files:**
- Modify: `README.md`
- Modify: `docs/CONTEXTO-PROYECTO.md`

- [ ] **Step 1: Verificación completa**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: tsc limpio; lint limpio; build OK con `/api/webhooks/didit` en la lista de rutas; todos los tests pasan (los 18 nuevos de `didit/firma` + `didit/cliente`, más los existentes).

- [ ] **Step 2: Verificación en navegador (preview tools)**

Levantar el dev server y comprobar, con una cuenta PCD que ya tenga los
datos del representante legal guardados:
1. `/vinculacion` muestra la nueva sección "Verificación de identidad" con
   el botón "Verificar identidad" habilitado.
2. Si se borran temporalmente los datos del representante (o se prueba con
   una cuenta sin esos campos), el botón aparece deshabilitado con el
   mensaje de "guarde primero los datos del representante legal".

(El flujo completo — clic → redirección a Didit → completar el flujo real →
recibir el webhook — no es verificable sin una sesión real de Didit y sin
que el webhook llegue a una URL pública; se prueba manualmente en Preview,
con Jaime completando el flujo real como representante legal de una cuenta
de prueba, una vez el workflow esté configurado en la consola de Didit.)

- [ ] **Step 3: Actualizar `README.md`**

Agregar una sección breve, después de la sección "Autenticación" y antes de
"Roadmap por fases":

```markdown
## Verificación de identidad (Didit)

Antes de aprobar a un PCD, el representante legal debe completar una
verificación de identidad externa (documento + prueba de vida + comparación
facial) con [Didit](https://didit.me), disparada desde `/vinculacion` como
un cuarto requisito junto a los 3 documentos KYC. El resultado llega de
forma asíncrona por webhook (`POST /api/webhooks/didit`, firmado con
HMAC-SHA256 sobre JSON canónico — ver `src/lib/didit/firma.ts`) y se guarda
en `validaciones_identidad`. `puedeAprobarUsuario` exige `estado='Approved'`
ahí, además de los 3 documentos — ver
`supabase/migrations/0006_verificacion_identidad.sql`. El resultado NO
aprueba automáticamente al PCD: sigue siendo el admin quien aprueba, con
esta verificación como requisito adicional visible en el expediente.
```

- [ ] **Step 4: Actualizar `docs/CONTEXTO-PROYECTO.md`**

En la tabla "Estado de fases", agregar una fila:

```markdown
| Verificación de identidad (Didit) | ✅ | Cuarto requisito de aprobación, webhook firmado, ver README |
```

En "Pendiente explícito", agregar un punto:

```markdown
4. **Configurar y probar el workflow de Didit en producción** una vez
   Jaime confirme que el workflow de consola (ID Verification + Passive
   Liveness + Face Match) está funcionando correctamente en Preview, y
   actualizar la URL del webhook registrada en Didit al dominio de
   producción cuando se haga el merge a `master`.
```

- [ ] **Step 5: Commit y push**

```bash
git add README.md docs/CONTEXTO-PROYECTO.md
git commit -m "docs: documenta la verificación de identidad del representante legal (Didit)"
git push
```

- [ ] **Step 6: Confirmar deploy de Preview**

Confirmar que el nuevo Preview de Vercel construyó OK. Recordar que las 3
variables de entorno (`DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`,
`DIDIT_WEBHOOK_SECRET`) ya están cargadas en Vercel para Production, Preview
y Development — no hace falta configurarlas de nuevo.

---

## Self-Review

- **Cobertura del spec:** migration + RLS (Task 1) ✓; tipos (Task 2) ✓; canonicalización JSON exacta + firma con ventana de 300s (Task 3) ✓; cliente Didit con `expected_details` derivado del representante (Task 4) ✓; cliente `service_role` nuevo, requerido porque el webhook no tiene sesión de usuario (Task 5) ✓; webhook que actualiza por `session_id` (Task 6) ✓; acción que valida que el representante esté guardado antes de crear la sesión (Task 7) ✓; UI con los 3 estados (aprobado/en revisión/en proceso/rechazado) y el botón deshabilitado sin datos del representante (Task 8) ✓; gating obligatorio en `puedeAprobarUsuario` + ambos call sites + visibilidad en el expediente admin (Task 9) ✓; docs + deploy (Task 10) ✓.
- **Placeholders:** ninguno — todo el código está completo en cada step, incluido el archivo completo actual y el reemplazo exacto en Task 9 Step 2 (`tests/validation/kyc.test.ts`).
- **Consistencia de tipos:** `EstadoVerificacionIdentidad` se define en Task 2 y se usa sin variarse en Tasks 8 y 9. `puedeAprobarUsuario(docs, verificacionIdentidad)` se define en Task 9 con esa firma exacta y se llama igual en los 2 call sites del mismo task. `crearSesionVerificacion`/`construirDetallesEsperados` se definen en Task 4 y se consumen sin cambios de nombre en Task 7. `verificarFirmaWebhook`/`canonicalizarJson` se definen en Task 3 y se consumen sin cambios en Task 6.
