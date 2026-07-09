# Fase 2 — Registro B2B + KYC + Panel de Cumplimiento · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un PCD se registra (empresa + correo confirmado), entra en estado *Pendiente*, sube sus 3 documentos KYC (RUT, Cámara de Comercio, Resolución DIAN) a Storage privado, y un administrador de cumplimiento los revisa documento por documento y da la aprobación final del usuario.

**Architecture:** Next.js 16 App Router con Server Components para lectura y Server Actions (`'use server'`) para mutaciones; toda regla de seguridad se apoya en el RLS ya montado en Supabase (Fase 1) — el frontend nunca es la única barrera. Los archivos KYC suben directo del navegador a Supabase Storage (bucket privado `kyc-documentos`, carpeta por usuario) y el admin los ve mediante signed URLs de corta vida. La confirmación de correo usa el flujo SSR de Supabase (`token_hash` + `verifyOtp`).

**Tech Stack:** Next.js 16 (App Router, proxy.ts, params async) · Supabase (`@supabase/ssr`) · Tailwind CSS v4 · shadcn/ui · zod · Vitest (unit tests de lógica pura).

**Decisiones de producto ya validadas por Jaime (2026-07-09):**
1. Aprobación **por documento + decisión final**: el admin aprueba/rechaza cada documento; cuando los 3 están aprobados, un botón habilita la aprobación final del usuario.
2. **Confirmación de correo obligatoria** antes de poder iniciar sesión.
3. Documento rechazado ⇒ el PCD ve la nota del admin y **re-sube solo ese documento** (vuelve a estado `pendiente`).

**Reglas de oro (aplican a TODO el copy y UI):** nunca "casas de cambio" — siempre "Profesionales de Compra y Venta de Divisas (PCD)"; la plataforma NO ejecuta transacciones; mantra "Seguridad y Confianza"; tema claro con acentos verdes; diseño institucional pulido.

---

## Estructura de archivos (mapa completo)

```
supabase/migrations/
  0002_fase2_kyc_ajustes.sql        ← fix RLS re-upload + límites del bucket

src/
  lib/
    validation/
      registro.ts                   ← schema zod del formulario de registro
      kyc.ts                        ← constantes KYC, validación de archivo, puedeAprobarUsuario()
    supabase/  (ya existen client.ts / server.ts / middleware.ts — no se tocan)
  components/
    ui/…                            ← generados por shadcn (button, card, badge, input, label, textarea, table, alert)
    site-header.tsx                 ← header institucional con sesión
    estado-badge.tsx                ← badge de estado (perfil y documentos)
  app/
    page.tsx                        ← MODIFICAR: landing con CTA registro/login
    (auth)/
      actions.ts                    ← registrarse / iniciarSesion / cerrarSesion
      login/page.tsx
      login/login-form.tsx
      registro/page.tsx
      registro/registro-form.tsx
      registro/confirmar/page.tsx   ← "revisa tu correo"
    auth/confirm/route.ts           ← verifica token_hash del correo
    dashboard/
      layout.tsx                    ← exige sesión, muestra header
      page.tsx                      ← estado del perfil + 3 slots de documentos
      documento-uploader.tsx        ← client component: sube a Storage + registra fila
      actions.ts                    ← registrarDocumento
    admin/
      layout.tsx                    ← exige rol admin (verificado contra BD)
      page.tsx                      ← lista de PCD filtrable por estado
      actions.ts                    ← revisarDocumento / aprobarUsuario / rechazarUsuario
      usuarios/[id]/page.tsx        ← expediente: perfil + 3 documentos + decisión final
    api/kyc/validacion-externa/route.ts  ← stub del futuro proveedor de identidad

tests/
  validation/registro.test.ts
  validation/kyc.test.ts

docs/
  arquitectura-validacion-identidad.md   ← diseño del endpoint externo (Fase 2 entregable)

vitest.config.ts
package.json                        ← MODIFICAR: script "test"
```

**Convención de Storage (ya definida en Fase 1):** `{{auth.uid()}}/{{tipo_documento}}-{{timestamp}}.{{ext}}` dentro del bucket privado `kyc-documentos`.

---

## Configuración manual en Supabase (Jaime — ANTES de la Task 5)

Estas 4 cosas se hacen en el dashboard de Supabase y no son código:

1. **Authentication → Sign In / Up → Email**: verificar que **"Confirm email"** esté activado (es el default).
2. **Authentication → URL Configuration**:
   - Site URL: `https://www.tasadirecta.com`
   - Redirect URLs: agregar `https://www.tasadirecta.com/**` y `http://localhost:3000/**`
3. **Authentication → Emails → Confirm signup**: reemplazar el cuerpo por esta plantilla en español (el `href` es lo crítico — usa `token_hash`):

```html
<h2>Bienvenido a Tasa Directa</h2>
<p>Gracias por registrarse como Profesional de Compra y Venta de Divisas.</p>
<p>Confirme su correo electrónico para continuar con el proceso de vinculación:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirmar mi correo</a></p>
<p>Seguridad y Confianza — Tasa Directa</p>
```

4. **SQL Editor**: correr `supabase/migrations/0002_fase2_kyc_ajustes.sql` (Task 1 de este plan).

---

### Task 0: Rama de trabajo (no romper producción)

Cada push a `master` deploya a www.tasadirecta.com. La Fase 2 se construye en una rama con previews de Vercel.

- [ ] **Step 1: Crear la rama**

```bash
git checkout -b fase-2-kyc
git push -u origin fase-2-kyc
```

Expected: rama creada; Vercel generará Preview Deployments (no toca producción) en cada push.

---

### Task 1: Migration 0002 — RLS de re-upload y límites del bucket

**Files:**
- Create: `supabase/migrations/0002_fase2_kyc_ajustes.sql`

**Por qué:** la política actual `"kyc: editar pendientes"` solo permite al usuario editar documentos en estado `pendiente` — un documento `rechazado` no se podría re-subir (decisión de producto #3). Además el `WITH CHECK` actual no impide que un usuario ponga su propio documento en `aprobado`. Y el bucket no tiene límite de tamaño ni de tipos MIME.

- [ ] **Step 1: Escribir la migration**

```sql
-- =============================================================================
-- TASA DIRECTA · Fase 2 · Ajustes KYC
-- 1) El PCD puede re-subir documentos RECHAZADOS (no solo pendientes),
--    pero cualquier edición suya deja el documento de vuelta en 'pendiente'
--    (imposible auto-aprobarse).
-- 2) Límites del bucket kyc-documentos: 10 MB, solo PDF/JPG/PNG.
-- Idempotente: se puede correr varias veces.
-- =============================================================================

drop policy if exists "kyc: editar pendientes" on public.documentos_kyc;
drop policy if exists "kyc: editar propios"    on public.documentos_kyc;
create policy "kyc: editar propios" on public.documentos_kyc
  for update to authenticated
  using (usuario_id = auth.uid() and estado in ('pendiente','rechazado'))
  with check (usuario_id = auth.uid() and estado = 'pendiente');

drop policy if exists "kyc: borrar pendientes" on public.documentos_kyc;
create policy "kyc: borrar pendientes" on public.documentos_kyc
  for delete to authenticated
  using (usuario_id = auth.uid() and estado in ('pendiente','rechazado'));

update storage.buckets
   set file_size_limit    = 10485760,  -- 10 MB
       allowed_mime_types = array['application/pdf','image/jpeg','image/png']
 where id = 'kyc-documentos';
```

- [ ] **Step 2: Correrla en Supabase**

Pegar en SQL Editor → Run. Expected: `Success. No rows returned`.

- [ ] **Step 3: Verificar**

```sql
select policyname from pg_policies where tablename = 'documentos_kyc';
select file_size_limit, allowed_mime_types from storage.buckets where id = 'kyc-documentos';
```

Expected: 5 políticas (leer / subir / editar propios / admin revisa / borrar pendientes); bucket con `10485760` y los 3 MIME types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_fase2_kyc_ajustes.sql
git commit -m "feat(db): fase 2 — re-upload de documentos rechazados y límites del bucket KYC"
```

---

### Task 2: Tooling — Vitest + zod + shadcn/ui

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`)
- Create (generados): `src/components/ui/*.tsx`, `src/lib/utils.ts`, `components.json`
- Modify: `src/app/globals.css` (tema verde sobre tokens shadcn)

- [ ] **Step 1: Instalar dependencias**

```bash
npm install zod
npm install -D vitest
npx shadcn@latest init -y -b neutral
npx shadcn@latest add button card badge input label textarea table alert
```

Nota: `shadcn init` reescribe `globals.css` con sus tokens — el paso 3 lo restaura con el tema verde.

- [ ] **Step 2: Configurar Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

En `package.json`, dentro de `"scripts"`, agregar:

```json
"test": "vitest run"
```

- [ ] **Step 3: Tema verde institucional sobre tokens shadcn**

Reemplazar `src/app/globals.css` COMPLETO por:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  /* Fondo claro institucional */
  --background: oklch(0.985 0.002 247.8);        /* #f8fafc slate-50 */
  --foreground: oklch(0.208 0.042 265.8);        /* #0f172a slate-900 */
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.208 0.042 265.8);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.208 0.042 265.8);
  /* Acento verde — confianza, dinero, crecimiento */
  --primary: oklch(0.627 0.17 149.2);            /* #16a34a green-600 */
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.968 0.007 247.9);         /* slate-100 */
  --secondary-foreground: oklch(0.208 0.042 265.8);
  --muted: oklch(0.968 0.007 247.9);
  --muted-foreground: oklch(0.554 0.046 257.4);  /* slate-500 */
  --accent: oklch(0.962 0.044 156.7);            /* green-50 */
  --accent-foreground: oklch(0.448 0.119 151.3); /* green-800 */
  --destructive: oklch(0.577 0.245 27.3);
  --border: oklch(0.929 0.013 255.5);            /* slate-200 */
  --input: oklch(0.929 0.013 255.5);
  --ring: oklch(0.627 0.17 149.2);
  --chart-1: oklch(0.627 0.17 149.2);
  --chart-2: oklch(0.527 0.154 150.1);
  --chart-3: oklch(0.723 0.192 149.6);
  --chart-4: oklch(0.448 0.119 151.3);
  --chart-5: oklch(0.87 0.087 154.9);
  --sidebar: oklch(1 0 0);
  --sidebar-foreground: oklch(0.208 0.042 265.8);
  --sidebar-primary: oklch(0.627 0.17 149.2);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.962 0.044 156.7);
  --sidebar-accent-foreground: oklch(0.448 0.119 151.3);
  --sidebar-border: oklch(0.929 0.013 255.5);
  --sidebar-ring: oklch(0.627 0.17 149.2);
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/* Producto institucional: siempre tema claro (no hay modo oscuro) */
body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

Nota: si `shadcn init` no instaló `tw-animate-css`, quitar esa línea de import o correr `npm i -D tw-animate-css`.

- [ ] **Step 4: Verificar build**

```bash
npm run build
```

Expected: `✓ Compiled successfully`, cero errores TypeScript.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: vitest + zod + shadcn/ui con tema verde institucional"
```

---

### Task 3: Validación — schemas zod con TDD

**Files:**
- Test: `tests/validation/registro.test.ts`
- Test: `tests/validation/kyc.test.ts`
- Create: `src/lib/validation/registro.ts`
- Create: `src/lib/validation/kyc.ts`

- [ ] **Step 1: Escribir los tests (fallan primero)**

`tests/validation/registro.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { registroSchema } from '@/lib/validation/registro'

const base = {
  razonSocial: 'Nutifinanzas S.A.S.',
  nit: '901234567-8',
  sede: 'Oviedo',
  ciudad: 'Medellín',
  telefono: '6044442211',
  whatsapp: '3001234567',
  correo: 'contacto@nutifinanzas.co',
  password: 'ClaveSegura123',
}

describe('registroSchema', () => {
  it('acepta un registro válido', () => {
    expect(registroSchema.safeParse(base).success).toBe(true)
  })
  it('acepta NIT sin dígito de verificación', () => {
    expect(registroSchema.safeParse({ ...base, nit: '901234567' }).success).toBe(true)
  })
  it('rechaza NIT con letras', () => {
    expect(registroSchema.safeParse({ ...base, nit: '90123A567' }).success).toBe(false)
  })
  it('rechaza correo inválido', () => {
    expect(registroSchema.safeParse({ ...base, correo: 'no-es-correo' }).success).toBe(false)
  })
  it('rechaza contraseña de menos de 8 caracteres', () => {
    expect(registroSchema.safeParse({ ...base, password: 'corta' }).success).toBe(false)
  })
  it('rechaza razón social vacía', () => {
    expect(registroSchema.safeParse({ ...base, razonSocial: '' }).success).toBe(false)
  })
  it('permite whatsapp vacío (opcional)', () => {
    expect(registroSchema.safeParse({ ...base, whatsapp: '' }).success).toBe(true)
  })
})
```

`tests/validation/kyc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  TIPOS_DOCUMENTO,
  ETIQUETAS_DOCUMENTO,
  validarArchivoKyc,
  puedeAprobarUsuario,
} from '@/lib/validation/kyc'

describe('constantes KYC', () => {
  it('define exactamente los 3 documentos requeridos', () => {
    expect(TIPOS_DOCUMENTO).toEqual(['rut', 'camara_comercio', 'resolucion_dian'])
    expect(Object.keys(ETIQUETAS_DOCUMENTO)).toHaveLength(3)
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

- [ ] **Step 2: Verificar que fallan**

```bash
npm test
```

Expected: FAIL — `Cannot find module '@/lib/validation/registro'`.

- [ ] **Step 3: Implementar los módulos**

`src/lib/validation/registro.ts`:

```ts
import { z } from 'zod'

const telefonoOpcional = z
  .string()
  .regex(/^\d{7,10}$/, 'Debe tener entre 7 y 10 dígitos, sin espacios')
  .or(z.literal(''))
  .optional()

export const registroSchema = z.object({
  razonSocial: z.string().min(3, 'Ingrese la razón social registrada ante la DIAN'),
  nit: z.string().regex(/^\d{8,10}(-\d)?$/, 'NIT inválido. Formato: 901234567-8'),
  sede: z.string().min(2, 'Ingrese la sede principal'),
  ciudad: z.string().min(2, 'Ingrese la ciudad'),
  telefono: telefonoOpcional,
  whatsapp: telefonoOpcional,
  correo: z.string().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

export type RegistroInput = z.infer<typeof registroSchema>
```

`src/lib/validation/kyc.ts`:

```ts
import type { TipoDoc, EstadoDoc } from '@/types/database'

export const TIPOS_DOCUMENTO = ['rut', 'camara_comercio', 'resolucion_dian'] as const

export const ETIQUETAS_DOCUMENTO: Record<TipoDoc, string> = {
  rut: 'RUT',
  camara_comercio: 'Cámara de Comercio',
  resolucion_dian: 'Resolución DIAN',
}

export const DESCRIPCIONES_DOCUMENTO: Record<TipoDoc, string> = {
  rut: 'Registro Único Tributario vigente, expedido por la DIAN.',
  camara_comercio: 'Certificado de existencia y representación legal (no mayor a 30 días).',
  resolucion_dian: 'Resolución de autorización como Profesional de Compra y Venta de Divisas.',
}

export const MAX_TAMANO_BYTES = 10 * 1024 * 1024 // 10 MB — igual al límite del bucket
export const MIME_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'] as const

/** Devuelve null si el archivo es válido, o el mensaje de error para mostrar al PCD. */
export function validarArchivoKyc(mime: string, tamanoBytes: number): string | null {
  if (!MIME_PERMITIDOS.includes(mime as (typeof MIME_PERMITIDOS)[number])) {
    return 'Formato no permitido. Suba el documento en PDF, JPG o PNG.'
  }
  if (tamanoBytes > MAX_TAMANO_BYTES) {
    return 'El archivo supera el máximo de 10 MB.'
  }
  return null
}

/** La aprobación final del PCD solo se habilita con los 3 documentos aprobados. */
export function puedeAprobarUsuario(
  docs: Array<{ tipo_documento: TipoDoc; estado: EstadoDoc }>
): boolean {
  return TIPOS_DOCUMENTO.every((tipo) =>
    docs.some((d) => d.tipo_documento === tipo && d.estado === 'aprobado')
  )
}
```

- [ ] **Step 4: Verificar que pasan**

```bash
npm test
```

Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/ src/lib/validation/
git commit -m "feat: validación zod de registro y reglas KYC con tests"
```

---

### Task 4: Componentes compartidos — header y badge de estado

**Files:**
- Create: `src/components/estado-badge.tsx`
- Create: `src/components/site-header.tsx`
- Modify: `src/app/page.tsx` (landing con CTA)

- [ ] **Step 1: EstadoBadge**

`src/components/estado-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import type { EstadoPerfil, EstadoDoc } from '@/types/database'

const ESTILOS: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  aprobado: 'bg-green-100 text-green-800 border-green-200',
  rechazado: 'bg-red-100 text-red-700 border-red-200',
  suspendido: 'bg-slate-200 text-slate-700 border-slate-300',
}

const ETIQUETAS: Record<string, string> = {
  pendiente: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  suspendido: 'Suspendido',
}

export function EstadoBadge({ estado }: { estado: EstadoPerfil | EstadoDoc }) {
  return (
    <Badge variant="outline" className={ESTILOS[estado]}>
      {ETIQUETAS[estado]}
    </Badge>
  )
}
```

- [ ] **Step 2: SiteHeader (server component, consciente de sesión)**

`src/components/site-header.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { cerrarSesion } from '@/app/(auth)/actions'

export async function SiteHeader() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let esAdmin = false
  if (user) {
    const { data: perfil } = await supabase
      .from('perfiles_usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()
    esAdmin = perfil?.rol === 'admin'
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            T
          </span>
          <span className="text-lg font-semibold tracking-tight">Tasa Directa</span>
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Button variant="ghost" asChild>
                <Link href="/dashboard">Mi cuenta</Link>
              </Button>
              {esAdmin && (
                <Button variant="ghost" asChild>
                  <Link href="/admin">Cumplimiento</Link>
                </Button>
              )}
              <form action={cerrarSesion}>
                <Button variant="outline" type="submit">Salir</Button>
              </form>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Ingresar</Link>
              </Button>
              <Button asChild>
                <Link href="/registro">Registrarse</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Landing con CTA**

Reemplazar `src/app/page.tsx` COMPLETO por:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SiteHeader } from '@/components/site-header'
import { ShieldCheck, FileCheck2, Handshake } from 'lucide-react'

const PILARES = [
  {
    icono: ShieldCheck,
    titulo: 'Solo PCD verificados',
    texto: 'Cada Profesional de Compra y Venta de Divisas pasa por verificación documental: RUT, Cámara de Comercio y Resolución DIAN.',
  },
  {
    icono: FileCheck2,
    titulo: 'Cumplimiento primero',
    texto: 'Un equipo de cumplimiento revisa y aprueba cada vinculación antes de habilitar el acceso al mercado.',
  },
  {
    icono: Handshake,
    titulo: 'Conexión directa',
    texto: 'Tasa Directa conecta la oferta y la demanda entre profesionales. Las operaciones se cierran directamente entre las partes.',
  },
]

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-24 text-center">
          <p className="mb-4 rounded-full border border-border bg-accent px-4 py-1 text-sm font-medium text-accent-foreground">
            Seguridad y Confianza
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            El marketplace B2B del sector cambiario en Colombia
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Plataforma exclusiva para Profesionales de Compra y Venta de Divisas (PCD)
            autorizados por la DIAN. Publique sus necesidades, encuentre contraparte
            y negocie de forma directa.
          </p>
          <div className="mt-10 flex gap-4">
            <Button size="lg" asChild>
              <Link href="/registro">Vincular mi empresa</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Ya tengo cuenta</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-white">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-16 sm:grid-cols-3">
            {PILARES.map(({ icono: Icono, titulo, texto }) => (
              <div key={titulo} className="flex flex-col gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                  <Icono className="h-5 w-5 text-primary" />
                </span>
                <h2 className="font-semibold">{titulo}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-auto border-t border-border py-8 text-center text-sm text-muted-foreground">
          Tasa Directa conecta profesionales; no ejecuta ni intermedia transacciones cambiarias.
        </footer>
      </main>
    </>
  )
}
```

Nota: `lucide-react` viene como dependencia de shadcn; si falta, `npm i lucide-react`.

- [ ] **Step 4: Verificar build** — `npm run build` → Expected: sin errores. (El import de `cerrarSesion` fallará hasta la Task 5 — si se ejecutan las tasks en orden estricto, crear primero el archivo `src/app/(auth)/actions.ts` de la Task 5 o construir Tasks 4 y 5 juntas y hacer un solo build.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ src/app/page.tsx
git commit -m "feat: header institucional, badge de estado y landing con CTA"
```

---

### Task 5: Autenticación — registro, confirmación de correo y login

**Files:**
- Create: `src/app/(auth)/actions.ts`
- Create: `src/app/(auth)/registro/page.tsx`
- Create: `src/app/(auth)/registro/registro-form.tsx`
- Create: `src/app/(auth)/registro/confirmar/page.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/login-form.tsx`
- Create: `src/app/auth/confirm/route.ts`

**Flujo:** registro (datos de empresa van en `user_metadata` → el trigger `handle_new_user` de la Fase 1 crea el perfil en estado `pendiente`) → correo de confirmación → `/auth/confirm` verifica `token_hash` → login → dashboard.

- [ ] **Step 1: Server Actions de auth**

`src/app/(auth)/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registroSchema } from '@/lib/validation/registro'

export type AuthState = { error: string | null }

export async function registrarse(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registroSchema.safeParse({
    razonSocial: formData.get('razonSocial'),
    nit: formData.get('nit'),
    sede: formData.get('sede'),
    ciudad: formData.get('ciudad'),
    telefono: formData.get('telefono') ?? '',
    whatsapp: formData.get('whatsapp') ?? '',
    correo: formData.get('correo'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { correo, password, razonSocial, nit, sede, ciudad, telefono, whatsapp } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: correo,
    password,
    options: {
      data: {
        razon_social: razonSocial,
        nit,
        sede,
        ciudad,
        telefono: telefono || null,
        whatsapp: whatsapp || null,
      },
    },
  })

  if (error) {
    return { error: 'No se pudo completar el registro. Verifique el correo o intente más tarde.' }
  }

  redirect('/registro/confirmar')
}

export async function iniciarSesion(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const correo = String(formData.get('correo') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!correo || !password) return { error: 'Ingrese su correo y contraseña.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password })

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Su correo aún no está confirmado. Revise su bandeja de entrada.' }
    }
    return { error: 'Credenciales incorrectas.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
```

- [ ] **Step 2: Ruta de confirmación de correo**

`src/app/auth/confirm/route.ts`:

```ts
import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirect('/dashboard')
    }
  }

  redirect('/login?error=confirmacion')
}
```

- [ ] **Step 3: Formulario de registro (client) + página**

`src/app/(auth)/registro/registro-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { registrarse, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const CAMPOS = [
  { name: 'razonSocial', label: 'Razón social *', placeholder: 'Nutifinanzas S.A.S.', type: 'text' },
  { name: 'nit', label: 'NIT *', placeholder: '901234567-8', type: 'text' },
  { name: 'sede', label: 'Sede principal *', placeholder: 'Oviedo', type: 'text' },
  { name: 'ciudad', label: 'Ciudad *', placeholder: 'Medellín', type: 'text' },
  { name: 'telefono', label: 'Teléfono fijo', placeholder: '6044442211', type: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', placeholder: '3001234567', type: 'tel' },
  { name: 'correo', label: 'Correo corporativo *', placeholder: 'contacto@suempresa.co', type: 'email' },
  { name: 'password', label: 'Contraseña * (mínimo 8 caracteres)', placeholder: '••••••••', type: 'password' },
] as const

export function RegistroForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    registrarse,
    { error: null }
  )

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {CAMPOS.map((campo) => (
        <div
          key={campo.name}
          className={campo.name === 'correo' || campo.name === 'password' ? 'sm:col-span-2' : ''}
        >
          <Label htmlFor={campo.name} className="mb-1.5 block">{campo.label}</Label>
          <Input
            id={campo.name}
            name={campo.name}
            type={campo.type}
            placeholder={campo.placeholder}
            required={campo.label.includes('*')}
          />
        </div>
      ))}
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="sm:col-span-2" size="lg">
        {pending ? 'Enviando…' : 'Crear cuenta de PCD'}
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Al registrarse, su empresa entra en proceso de verificación documental.
        Solo los Profesionales de Compra y Venta de Divisas aprobados por nuestro
        equipo de cumplimiento acceden al mercado.
      </p>
    </form>
  )
}
```

`src/app/(auth)/registro/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RegistroForm } from './registro-form'

export const metadata: Metadata = { title: 'Registro de PCD' }

export default function RegistroPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Vincule su empresa</CardTitle>
            <CardDescription>
              Registro exclusivo para Profesionales de Compra y Venta de Divisas (PCD)
              autorizados por la DIAN.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistroForm />
          </CardContent>
        </Card>
      </main>
    </>
  )
}
```

- [ ] **Step 4: Página "revisa tu correo"**

`src/app/(auth)/registro/confirmar/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MailCheck } from 'lucide-react'

export const metadata: Metadata = { title: 'Confirme su correo' }

export default function ConfirmarPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-24">
        <Card className="text-center">
          <CardHeader className="items-center">
            <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <MailCheck className="h-6 w-6 text-primary" />
            </span>
            <CardTitle>Revise su correo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Le enviamos un enlace de confirmación. Tras confirmar, podrá iniciar
            sesión y continuar con la carga de sus documentos de vinculación.
          </CardContent>
        </Card>
      </main>
    </>
  )
}
```

- [ ] **Step 5: Login (client form + página)**

`src/app/(auth)/login/login-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { iniciarSesion, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginForm({ errorInicial }: { errorInicial?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    iniciarSesion,
    { error: errorInicial ?? null }
  )

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <Label htmlFor="correo" className="mb-1.5 block">Correo</Label>
        <Input id="correo" name="correo" type="email" required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}
```

`src/app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const errorInicial =
    error === 'confirmacion'
      ? 'El enlace de confirmación no es válido o expiró. Intente iniciar sesión o regístrese de nuevo.'
      : undefined

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Ingresar</CardTitle>
            <CardDescription>Acceso para PCD registrados.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <LoginForm errorInicial={errorInicial} />
            <p className="text-center text-sm text-muted-foreground">
              ¿Aún no está vinculado?{' '}
              <Link href="/registro" className="font-medium text-primary hover:underline">
                Registre su empresa
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
```

- [ ] **Step 6: Verificar build**

```bash
npm run build
```

Expected: compila; rutas `/login`, `/registro`, `/registro/confirmar`, `/auth/confirm` listadas.

- [ ] **Step 7: Prueba manual local**

```bash
npm run dev
```

1. Abrir `http://localhost:3000/registro`, registrar una empresa de prueba con un correo real.
2. Expected: redirige a `/registro/confirmar`; llega correo de Supabase; el enlace lleva a `/auth/confirm` y de ahí a `/dashboard` (404 por ahora — se crea en Task 6; lo importante es que la sesión queda activa).
3. En Supabase → Table Editor → `perfiles_usuarios`: existe la fila con `estado='pendiente'` y la razón social del formulario.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(auth\)/ src/app/auth/
git commit -m "feat: registro B2B con confirmación de correo y login (Server Actions)"
```

---

### Task 6: Dashboard del PCD — estado y carga de documentos KYC

**Files:**
- Create: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/page.tsx`
- Create: `src/app/dashboard/documento-uploader.tsx`
- Create: `src/app/dashboard/actions.ts`

**Flujo de carga:** el archivo sube **directo del navegador** a Storage (evita el límite de body de Server Actions y aprovecha las políticas RLS del bucket ya montadas), y luego una Server Action registra/actualiza la fila en `documentos_kyc`. El RLS garantiza: solo su carpeta, solo PDF/JPG/PNG ≤ 10 MB (bucket), y toda edición del PCD deja el documento en `pendiente` (migration 0002).

- [ ] **Step 1: Server Action registrarDocumento**

`src/app/dashboard/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TIPOS_DOCUMENTO } from '@/lib/validation/kyc'
import type { TipoDoc } from '@/types/database'

export type DocState = { error: string | null; ok?: boolean }

export async function registrarDocumento(
  tipo: TipoDoc,
  storagePath: string,
  nombreArchivo: string
): Promise<DocState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  if (!TIPOS_DOCUMENTO.includes(tipo)) return { error: 'Tipo de documento inválido.' }

  // El path DEBE estar dentro de la carpeta del usuario (defensa además del RLS de Storage)
  if (!storagePath.startsWith(`${user.id}/`)) {
    return { error: 'Ruta de archivo inválida.' }
  }

  // Upsert: si el documento existía (p. ej. rechazado), la fila vuelve a 'pendiente'.
  // El RLS (migration 0002) impide editar documentos ya aprobados.
  const { error } = await supabase
    .from('documentos_kyc')
    .upsert(
      {
        usuario_id: user.id,
        tipo_documento: tipo,
        storage_path: storagePath,
        nombre_archivo: nombreArchivo,
        estado: 'pendiente',
        notas_revision: null,
        revisado_por: null,
        revisado_at: null,
      },
      { onConflict: 'usuario_id,tipo_documento' }
    )

  if (error) {
    return { error: 'No se pudo registrar el documento. Intente de nuevo.' }
  }

  revalidatePath('/dashboard')
  return { error: null, ok: true }
}
```

- [ ] **Step 2: Uploader (client component)**

`src/app/dashboard/documento-uploader.tsx`:

```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarDocumento } from './actions'
import { validarArchivoKyc } from '@/lib/validation/kyc'
import { Button } from '@/components/ui/button'
import type { TipoDoc } from '@/types/database'

export function DocumentoUploader({
  tipo,
  usuarioId,
  esReemplazo,
}: {
  tipo: TipoDoc
  usuarioId: string
  esReemplazo: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [, startTransition] = useTransition()

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const errorValidacion = validarArchivoKyc(file.type, file.size)
    if (errorValidacion) {
      setError(errorValidacion)
      return
    }

    setError(null)
    setSubiendo(true)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `${usuarioId}/${tipo}-${Date.now()}.${ext}`
    const supabase = createClient()

    const { error: errorUpload } = await supabase.storage
      .from('kyc-documentos')
      .upload(path, file, { contentType: file.type })

    if (errorUpload) {
      setSubiendo(false)
      setError('No se pudo subir el archivo. Intente de nuevo.')
      return
    }

    startTransition(async () => {
      const res = await registrarDocumento(tipo, path, file.name)
      setSubiendo(false)
      if (res.error) setError(res.error)
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={onFileChange}
      />
      <Button
        variant={esReemplazo ? 'outline' : 'default'}
        disabled={subiendo}
        onClick={() => inputRef.current?.click()}
      >
        {subiendo ? 'Subiendo…' : esReemplazo ? 'Subir reemplazo' : 'Subir documento'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Layout protegido**

`src/app/dashboard/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-10">{children}</main>
    </>
  )
}
```

- [ ] **Step 4: Página del dashboard**

`src/app/dashboard/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EstadoBadge } from '@/components/estado-badge'
import { DocumentoUploader } from './documento-uploader'
import {
  TIPOS_DOCUMENTO,
  ETIQUETAS_DOCUMENTO,
  DESCRIPCIONES_DOCUMENTO,
} from '@/lib/validation/kyc'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: perfil }, { data: docs }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', user.id),
  ])

  if (!perfil) redirect('/login')

  const documentos = TIPOS_DOCUMENTO.map((tipo) => ({
    tipo,
    doc: docs?.find((d) => d.tipo_documento === tipo) ?? null,
  }))

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{perfil.razon_social}</h1>
          <p className="text-sm text-muted-foreground">NIT {perfil.nit ?? '—'} · {perfil.ciudad ?? ''}</p>
        </div>
        <EstadoBadge estado={perfil.estado} />
      </div>

      {perfil.estado === 'pendiente' && (
        <Alert>
          <AlertTitle>Verificación en proceso</AlertTitle>
          <AlertDescription>
            Suba los 3 documentos requeridos. Nuestro equipo de cumplimiento los
            revisará y le notificaremos la decisión.
          </AlertDescription>
        </Alert>
      )}
      {perfil.estado === 'rechazado' && (
        <Alert variant="destructive">
          <AlertTitle>Vinculación rechazada</AlertTitle>
          <AlertDescription>
            {perfil.motivo_estado ?? 'Contacte a soporte para más información.'}
          </AlertDescription>
        </Alert>
      )}
      {perfil.estado === 'aprobado' && (
        <Alert className="border-green-200 bg-green-50">
          <AlertTitle>Empresa verificada</AlertTitle>
          <AlertDescription>
            Su vinculación fue aprobada. El acceso al mercado se habilita con una
            membresía activa (próximamente).
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Documentos de vinculación</h2>
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
    </div>
  )
}
```

- [ ] **Step 5: Verificar build** — `npm run build`. Expected: sin errores, ruta `/dashboard` listada.

- [ ] **Step 6: Prueba manual del flujo KYC**

Con la cuenta de prueba de la Task 5 (correo ya confirmado):
1. Login → `/dashboard`: se ven las 3 tarjetas con botón "Subir documento".
2. Subir un PDF < 10 MB al RUT → la tarjeta pasa a "Pendiente de revisión" con el nombre del archivo.
3. Intentar subir un `.docx` → error de formato en la tarjeta, no sube.
4. En Supabase → Storage → `kyc-documentos`: existe `{uid}/rut-*.pdf`. En `documentos_kyc`: fila `estado='pendiente'`.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/
git commit -m "feat: dashboard del PCD con estado de vinculación y carga de documentos KYC"
```

---

### Task 7: Panel de Cumplimiento (admin)

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/actions.ts`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/usuarios/[id]/page.tsx`

**Seguridad en capas:** el layout verifica `rol='admin'` contra la BD; cada Server Action lo re-verifica; y aunque ambos fallaran, el RLS de la Fase 1 impide a un no-admin leer o modificar datos ajenos.

- [ ] **Step 1: Layout con guard de admin**

`src/app/admin/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol !== 'admin') redirect('/dashboard')

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </>
  )
}
```

- [ ] **Step 2: Server Actions de cumplimiento**

`src/app/admin/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { puedeAprobarUsuario } from '@/lib/validation/kyc'

export type AdminState = { error: string | null }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, admin: null }
  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()
  return { supabase, admin: perfil?.rol === 'admin' ? user : null }
}

export async function revisarDocumento(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const docId = String(formData.get('docId') ?? '')
  const decision = String(formData.get('decision') ?? '')
  const nota = String(formData.get('nota') ?? '').trim()

  if (!docId || !['aprobado', 'rechazado'].includes(decision)) {
    return { error: 'Solicitud inválida.' }
  }
  if (decision === 'rechazado' && nota.length < 5) {
    return { error: 'Indique el motivo del rechazo (mínimo 5 caracteres) para que el PCD sepa qué corregir.' }
  }

  const { error } = await supabase
    .from('documentos_kyc')
    .update({
      estado: decision as 'aprobado' | 'rechazado',
      notas_revision: nota || null,
      revisado_por: admin.id,
      revisado_at: new Date().toISOString(),
    })
    .eq('id', docId)

  if (error) return { error: 'No se pudo guardar la revisión.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function aprobarUsuario(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!usuarioId) return { error: 'Solicitud inválida.' }

  const { data: docs } = await supabase
    .from('documentos_kyc')
    .select('tipo_documento, estado')
    .eq('usuario_id', usuarioId)

  if (!puedeAprobarUsuario(docs ?? [])) {
    return { error: 'No se puede aprobar: los 3 documentos deben estar aprobados primero.' }
  }

  const { error } = await supabase
    .from('perfiles_usuarios')
    .update({ estado: 'aprobado', motivo_estado: null })
    .eq('id', usuarioId)

  if (error) return { error: 'No se pudo aprobar el usuario.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function rechazarUsuario(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  const motivo = String(formData.get('motivo') ?? '').trim()
  if (!usuarioId) return { error: 'Solicitud inválida.' }
  if (motivo.length < 5) {
    return { error: 'Indique el motivo del rechazo (mínimo 5 caracteres).' }
  }

  const { error } = await supabase
    .from('perfiles_usuarios')
    .update({ estado: 'rechazado', motivo_estado: motivo })
    .eq('id', usuarioId)

  if (error) return { error: 'No se pudo rechazar el usuario.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}
```

- [ ] **Step 3: Lista de PCD (filtrable por estado)**

`src/app/admin/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { EstadoBadge } from '@/components/estado-badge'
import type { EstadoPerfil } from '@/types/database'

export const metadata: Metadata = { title: 'Cumplimiento' }

const FILTROS: Array<{ valor: EstadoPerfil; etiqueta: string }> = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'aprobado', etiqueta: 'Aprobados' },
  { valor: 'rechazado', etiqueta: 'Rechazados' },
  { valor: 'suspendido', etiqueta: 'Suspendidos' },
]

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  const { estado: estadoParam } = await searchParams
  const estado = (FILTROS.some((f) => f.valor === estadoParam)
    ? estadoParam
    : 'pendiente') as EstadoPerfil

  const supabase = await createClient()
  const { data: perfiles } = await supabase
    .from('perfiles_usuarios')
    .select('id, razon_social, nit, ciudad, correo, estado, created_at')
    .eq('rol', 'usuario')
    .eq('estado', estado)
    .order('created_at', { ascending: true })

  const ids = (perfiles ?? []).map((p) => p.id)
  const { data: docs } = ids.length
    ? await supabase
        .from('documentos_kyc')
        .select('usuario_id, estado')
        .in('usuario_id', ids)
    : { data: [] as Array<{ usuario_id: string; estado: string }> }

  const resumenDocs = (usuarioId: string) => {
    const propios = (docs ?? []).filter((d) => d.usuario_id === usuarioId)
    const aprobados = propios.filter((d) => d.estado === 'aprobado').length
    return `${aprobados}/3 aprobados · ${propios.length}/3 subidos`
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de Cumplimiento</h1>
        <p className="text-sm text-muted-foreground">
          Revisión y aprobación de Profesionales de Compra y Venta de Divisas.
        </p>
      </div>

      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            variant={f.valor === estado ? 'default' : 'outline'}
            size="sm"
            asChild
          >
            <Link href={`/admin?estado=${f.valor}`}>{f.etiqueta}</Link>
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>NIT</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Documentos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(perfiles ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.razon_social}</div>
                  <div className="text-xs text-muted-foreground">{p.correo}</div>
                </TableCell>
                <TableCell>{p.nit ?? '—'}</TableCell>
                <TableCell>{p.ciudad ?? '—'}</TableCell>
                <TableCell className="text-sm">{resumenDocs(p.id)}</TableCell>
                <TableCell><EstadoBadge estado={p.estado} /></TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/usuarios/${p.id}`}>Revisar</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!perfiles?.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No hay PCD en este estado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Expediente del PCD (revisión + decisión final)**

`src/app/admin/usuarios/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EstadoBadge } from '@/components/estado-badge'
import { ETIQUETAS_DOCUMENTO, TIPOS_DOCUMENTO, puedeAprobarUsuario } from '@/lib/validation/kyc'
import { revisarDocumento, aprobarUsuario, rechazarUsuario } from '../../actions'

export const metadata: Metadata = { title: 'Expediente PCD' }

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: perfil }, { data: docs }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', id),
  ])

  if (!perfil) notFound()

  // Signed URLs (10 min) para ver los archivos del bucket privado
  const urls: Record<string, string | null> = {}
  for (const doc of docs ?? []) {
    const { data } = await supabase.storage
      .from('kyc-documentos')
      .createSignedUrl(doc.storage_path, 600)
    urls[doc.id] = data?.signedUrl ?? null
  }

  const listo = puedeAprobarUsuario(
    (docs ?? []).map((d) => ({ tipo_documento: d.tipo_documento, estado: d.estado }))
  )

  // Wrappers para usar las actions (firma useActionState) directamente en <form action>
  const revisarAction = revisarDocumento.bind(null, { error: null })
  const aprobarAction = aprobarUsuario.bind(null, { error: null })
  const rechazarAction = rechazarUsuario.bind(null, { error: null })

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin">← Volver</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">{perfil.razon_social}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              NIT {perfil.nit ?? '—'} · {perfil.sede ?? '—'} · {perfil.ciudad ?? '—'}
            </p>
            <p className="text-sm text-muted-foreground">
              {perfil.correo} · Tel {perfil.telefono ?? '—'} · WhatsApp {perfil.whatsapp ?? '—'}
            </p>
          </div>
          <EstadoBadge estado={perfil.estado} />
        </CardHeader>
      </Card>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Documentos</h2>
        {TIPOS_DOCUMENTO.map((tipo) => {
          const doc = docs?.find((d) => d.tipo_documento === tipo)
          return (
            <Card key={tipo}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{ETIQUETAS_DOCUMENTO[tipo]}</CardTitle>
                {doc ? <EstadoBadge estado={doc.estado} /> : (
                  <span className="text-sm text-muted-foreground">Sin subir</span>
                )}
              </CardHeader>
              {doc && (
                <CardContent className="grid gap-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{doc.nombre_archivo ?? doc.storage_path}</span>
                    {urls[doc.id] && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={urls[doc.id]!} target="_blank" rel="noopener noreferrer">
                          Ver documento
                        </a>
                      </Button>
                    )}
                  </div>
                  {doc.notas_revision && (
                    <p className="text-sm text-muted-foreground">Nota previa: {doc.notas_revision}</p>
                  )}
                  {doc.estado === 'pendiente' && (
                    <form action={revisarAction} className="grid gap-3">
                      <input type="hidden" name="docId" value={doc.id} />
                      <Textarea
                        name="nota"
                        placeholder="Nota de revisión (obligatoria al rechazar; ej.: 'RUT ilegible, subir escaneado a color')"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button type="submit" name="decision" value="aprobado" size="sm">
                          Aprobar documento
                        </Button>
                        <Button type="submit" name="decision" value="rechazado" variant="destructive" size="sm">
                          Rechazar documento
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </section>

      {perfil.estado === 'pendiente' && (
        <section className="grid gap-4 rounded-lg border border-border bg-white p-6">
          <h2 className="text-lg font-semibold">Decisión final</h2>
          <form action={aprobarAction}>
            <input type="hidden" name="usuarioId" value={perfil.id} />
            <Button type="submit" disabled={!listo} size="lg">
              Aprobar PCD
            </Button>
            {!listo && (
              <p className="mt-2 text-sm text-muted-foreground">
                Se habilita cuando los 3 documentos estén aprobados.
              </p>
            )}
          </form>
          <form action={rechazarAction} className="grid gap-3">
            <input type="hidden" name="usuarioId" value={perfil.id} />
            <Textarea
              name="motivo"
              placeholder="Motivo del rechazo definitivo (visible para el PCD)"
              rows={2}
            />
            <Button type="submit" variant="destructive" className="w-fit">
              Rechazar vinculación
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}
```

Nota de diseño: las Server Actions usan firma `(prev, formData)` para ser compatibles con `useActionState`; aquí se consumen desde `<form action>` con `.bind(null, {error:null})`. Los mensajes de error de validación server-side no se muestran inline en esta versión (el estado se refleja al revalidar); si Sonnet prefiere feedback inline, puede convertir los formularios del expediente en client components con `useActionState` sin tocar las actions.

- [ ] **Step 5: Verificar build** — `npm run build`. Expected: sin errores; rutas `/admin` y `/admin/usuarios/[id]`.

- [ ] **Step 6: Prueba manual del panel**

1. Login con la cuenta **admin** (creada en Fase 1) → `/admin`: la cuenta de prueba aparece en "Pendientes" con "0/3 aprobados · 1/3 subidos".
2. Entrar al expediente → "Ver documento" abre el PDF (signed URL).
3. Rechazar el RUT sin nota → error/reload sin cambio; con nota → queda "Rechazado".
4. Login como el PCD de prueba → el dashboard muestra la nota y permite "Subir reemplazo" → vuelve a "Pendiente".
5. Como admin: aprobar los 3 documentos → botón "Aprobar PCD" se habilita → aprobarlo.
6. El PCD ve el banner verde "Empresa verificada".
7. Con una cuenta NO admin, ir a `/admin` → redirige a `/dashboard`.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/
git commit -m "feat: panel de cumplimiento — revisión por documento y decisión final del PCD"
```

---

### Task 8: Arquitectura del endpoint de validación de identidad externa (stub)

**Files:**
- Create: `docs/arquitectura-validacion-identidad.md`
- Create: `src/app/api/kyc/validacion-externa/route.ts`

Entregable de la Fase 2 según la misión: *"diseñar la arquitectura del endpoint para integrar más adelante un servicio externo de validación de identidad"*. Se entrega el contrato + un stub que responde 501.

- [ ] **Step 1: Documento de arquitectura**

`docs/arquitectura-validacion-identidad.md`:

```markdown
# Arquitectura — Validación de identidad externa (diseño Fase 2, integración futura)

## Objetivo
Complementar la revisión manual de cumplimiento con un proveedor externo de
verificación de identidad/antecedentes (p. ej. Truora, Metamap, RegCheck),
sin acoplar la plataforma a un proveedor específico.

## Diseño: patrón adaptador + webhook

1. **Disparo** — al aprobar los 3 documentos, el panel admin podrá (opt-in)
   solicitar una verificación externa: `POST /api/kyc/validacion-externa`.
2. **Adaptador por proveedor** — interfaz única en `src/lib/kyc/proveedor.ts`:

   ```ts
   interface ProveedorValidacion {
     iniciarVerificacion(input: {
       usuarioId: string
       nit: string
       razonSocial: string
     }): Promise<{ referenciaExterna: string }>
   }
   ```

3. **Callback asíncrono** — el proveedor notifica el resultado a
   `POST /api/webhooks/validacion-identidad` (ruta reservada), firmado con
   secreto compartido (`VALIDACION_WEBHOOK_SECRET`).
4. **Persistencia** — tabla futura `validaciones_externas`
   (usuario_id, proveedor, referencia_externa, resultado, payload jsonb,
   created_at). Migration cuando se contrate el proveedor.
5. **Decisión** — el resultado NO aprueba automáticamente: se muestra como
   señal adicional en el expediente; la decisión final sigue siendo humana
   (principio "Seguridad y Confianza" = cumplimiento con criterio).

## Contrato del endpoint (estable desde hoy)

`POST /api/kyc/validacion-externa`
- Auth: sesión admin (verificada server-side).
- Body: `{ "usuarioId": "uuid" }`
- 202: `{ "ok": true, "referenciaExterna": "..." }`
- 501 mientras no haya proveedor contratado (estado actual).
```

- [ ] **Step 2: Stub del endpoint**

`src/app/api/kyc/validacion-externa/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Contrato estable — ver docs/arquitectura-validacion-identidad.md
// Se activará al contratar el proveedor de verificación de identidad.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol !== 'admin') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 })
  }

  return NextResponse.json(
    { ok: false, error: 'Proveedor de validación externa aún no configurado' },
    { status: 501 }
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add docs/arquitectura-validacion-identidad.md src/app/api/kyc/
git commit -m "feat: contrato y stub del endpoint de validación de identidad externa"
```

---

### Task 9: Verificación final, merge y deploy

- [ ] **Step 1: Suite completa**

```bash
npm test && npm run lint && npm run build
```

Expected: 13 tests PASS, lint sin errores, build limpio.

- [ ] **Step 2: Checklist E2E en el Preview de Vercel** (URL del preview de la rama `fase-2-kyc`)

Recorrer la prueba manual completa: registro → correo → confirmación → login → subir 3 docs → admin rechaza 1 → PCD re-sube → admin aprueba 3 → aprobar PCD → banner verde. Verificar también `/api/health` → `ok: true`.

- [ ] **Step 3: Merge a producción**

```bash
git checkout master
git merge fase-2-kyc
git push
```

Expected: Vercel deploya a www.tasadirecta.com automáticamente.

- [ ] **Step 4: Smoke test en producción**

Abrir `https://www.tasadirecta.com` → landing nueva; `/registro` y `/login` cargan; `/api/health` → `ok: true`.

- [ ] **Step 5: Actualizar README**

Marcar Fase 2 como completada en la tabla de roadmap del `README.md` y commitear:

```bash
git add README.md
git commit -m "docs: marcar fase 2 (registro + KYC + cumplimiento) como completada"
git push
```

---

## Fuera de alcance de la Fase 2 (no implementar)

- Correos transaccionales de aprobación/rechazo (Resend) → **Fase 5** (por ahora el PCD ve su estado al entrar al dashboard).
- Membresías y marketplace → **Fases 3 y 4**.
- Integración real del proveedor de identidad → solo contrato + stub (Task 8).
- Recuperación de contraseña → se agrega en un incremento posterior (anotar como deuda conocida).

## Riesgos y notas para el ejecutor

1. **Orden Tasks 4–5:** `site-header.tsx` importa `cerrarSesion` de la Task 5. Si se compila entre tareas, crear `src/app/(auth)/actions.ts` primero o ejecutar ambas antes del build.
2. **shadcn init reescribe `globals.css`** — aplicar el CSS de la Task 2 Step 3 DESPUÉS del init.
3. **La plantilla de correo de Supabase** (config manual) es prerequisito del flujo de confirmación de la Task 5 — sin ella el enlace del correo no apunta a `/auth/confirm`.
4. **Nunca usar la `service_role` key en este código** — todo pasa por el cliente con sesión y RLS. Está prohibido importarla fuera de un futuro cron/webhook server-only.
5. **Terminología:** revisar todo copy nuevo contra las reglas de oro (PCD, no ejecutamos transacciones, Seguridad y Confianza).
```
