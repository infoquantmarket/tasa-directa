# Fase 2.6 — Onboarding completo: cuenta mínima, perfil de empresa y contrato · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Rehacer el flujo de vinculación del PCD en 3 etapas separadas — (1) **cuenta mínima** (solo correo + contraseña), (2) **perfil de empresa completo** tras el login (empresa + representante legal + persona de contacto + documentos), (3) **aceptación digital del contrato de servicios + autorización de tratamiento de datos** una vez aprobados los documentos. Construir todo con trazabilidad legal (versión + fecha + IP), aviso de confidencialidad, y un documento opcional de composición accionaria.

**Architecture:** Se separa autenticación de perfil: `registro` deja de recoger datos de empresa (van a `perfiles_usuarios` vía el formulario `/vinculacion` después del login, no en los metadatos de signUp). Se agrega una bandera `perfil_completo`; el dashboard redirige a `/vinculacion` mientras esté incompleto. La aceptación del contrato se registra en una tabla `aceptaciones` (ledger inmutable con IP/user-agent capturados server-side) y se muestra como puerta después de la aprobación KYC. El texto legal vive versionado en el código (Jaime lo reemplaza); guardamos qué versión aceptó cada quien. Sigue el mismo stack y convenciones de las fases previas: Next.js 16 App Router, Supabase + RLS, shadcn/ui sobre Base UI (`render`, no `asChild`), Server Actions con `useActionState` en cliente y wrapper-void en `<form action>` server-side, Vitest para lógica pura.

**Decisiones de producto congeladas (Jaime, 2026-07-15):**
1. Flujo en 3 etapas: cuenta mínima → perfil completo (post-login) → contrato. Correo = usuario (Supabase Auth estándar, sin "username" aparte).
2. Formulario de vinculación en **una página con secciones** (Empresa / Representante / Contacto / Documentos).
3. Perfil = empresa + representante + contacto. **Sin** campos SARLAFT extra (la Resolución DIAN ya implica que la DIAN verificó cumplimiento).
4. **Composición accionaria**: documento opcional, no bloquea la aprobación.
5. **Aviso de confidencialidad** visible: la documentación es confidencial y solo se usa para validar identidad y seguridad de los usuarios.
6. **Contrato**: aceptación digital con trazabilidad (click-wrap), gratis, empaquetada con la autorización de tratamiento de datos (Habeas Data, Ley 1581/2012). Válida en Colombia (Ley 527/1999, Decreto 2364/2012) para un contrato de servicios. Se deja el "hueco" para e-firma PDF (DocuSeal/Zapsign) a futuro. **El texto legal lo aporta Jaime** (idealmente revisado por abogado); la plataforma pone el mecanismo.

**Reglas de oro (todo el copy):** nunca "casas de cambio" → PCD; la plataforma no ejecuta transacciones; "Seguridad y Confianza"; tema verde del logo, institucional.

**Contexto del código actual (verificado esta sesión):**
- `perfiles_usuarios` (columnas): id, tipo_usuario, razon_social (NOT NULL hoy), nombre_comercial, nit, sede, ciudad, telefono, whatsapp, correo, rol, estado, motivo_estado, created_at, updated_at.
- `registroSchema` (`src/lib/validation/registro.ts`): razonSocial, nit, sede, ciudad, telefono, whatsapp, correo, password.
- `registrarse` (`src/app/(auth)/actions.ts`): mete datos de empresa en `options.data` de `signUp`; el trigger `handle_new_user` crea el perfil desde esos metadatos.
- `registro-form.tsx`: formulario grande con `CiudadCombobox` (reutilizable), patrón de preservación de valores en error (`state.valores` + `resetKey`).
- `documentos_kyc`: 3 tipos requeridos (rut, camara_comercio, resolucion_dian). `DocumentoUploader` (client, sube directo a Storage). `puedeAprobarUsuario` exige los 3.
- `dashboard/page.tsx`: estado del perfil + docs + cards de membresía/tokens. Redirige a /login si no hay sesión.
- `admin/usuarios/[id]/page.tsx`: expediente con documentos + gestión comercial (Fase 2.5) + decisión final.
- Migrations aplicadas en vivo: 0001, 0001a, 0002, 0003. Esta fase agrega **0004**.

---

## Estructura de archivos

```
supabase/migrations/
  0004_onboarding_perfil_contrato.sql   ← perfil expandido, aceptaciones, doc opcional, trigger mínimo

src/
  types/database.ts                      ← MOD: columnas de perfil, doc opcional, tabla aceptaciones
  lib/
    validation/
      registro.ts                        ← MOD: schema mínimo (correo + password + confirmar)
      perfil.ts                          ← NUEVO: perfilSchema (empresa/representante/contacto) + perfilCompleto()
    legal/
      contrato.ts                        ← NUEVO: versión + texto (placeholder) del contrato y tratamiento de datos
  app/
    (auth)/
      actions.ts                         ← MOD: registrarse mínimo; iniciarSesion sin cambios de fondo
      registro/registro-form.tsx         ← MOD: solo correo + contraseña + confirmar
      registro/page.tsx                  ← MOD: copy de bienvenida (qué sigue después)
    vinculacion/
      page.tsx                           ← NUEVO: gate + carga de perfil/docs
      vinculacion-form.tsx               ← NUEVO: formulario seccionado (client)
      actions.ts                         ← NUEVO: guardarPerfil
    contrato/
      page.tsx                           ← NUEVO: contrato + aceptación (gate post-aprobación)
      contrato-form.tsx                  ← NUEVO: checkboxes + aceptar (client)
      actions.ts                         ← NUEVO: aceptarTerminos (captura IP/UA server-side)
    dashboard/
      layout.tsx                         ← MOD: redirige a /vinculacion si perfil incompleto
      page.tsx                           ← MOD: aviso confidencialidad, doc opcional, card de contrato
    admin/usuarios/[id]/
      page.tsx                           ← MOD: mostrar perfil completo + composición + estado del contrato
      perfil-empresa.tsx                 ← NUEVO: bloque de solo-lectura del perfil (server component)

tests/validation/
  registro.test.ts                       ← MOD: schema mínimo
  perfil.test.ts                         ← NUEVO

README.md                                ← MOD: flujo de onboarding actualizado
```

---

### Task O1: Migration 0004 — perfil expandido, aceptaciones y registro mínimo

**Files:** Create `supabase/migrations/0004_onboarding_perfil_contrato.sql`. **La corre Jaime en el SQL Editor.** Idempotente.

- [ ] **Step 1: Escribir la migration**

```sql
-- =============================================================================
-- TASA DIRECTA · Fase 2.6 · Onboarding: perfil de empresa + contrato
-- Decisión 2026-07-15: cuenta mínima → perfil completo (post-login) → contrato.
-- Idempotente.
-- =============================================================================

-- 1. razon_social pasa a nullable: ahora se llena en /vinculacion, no en el registro
alter table public.perfiles_usuarios alter column razon_social drop not null;

-- 2. Columnas nuevas del perfil de empresa
alter table public.perfiles_usuarios
  add column if not exists tipo_sociedad    text,
  add column if not exists direccion        text,
  add column if not exists sitio_web         text,
  add column if not exists rep_nombre        text,
  add column if not exists rep_tipo_doc      text,
  add column if not exists rep_num_doc       text,
  add column if not exists rep_correo        text,
  add column if not exists rep_celular       text,
  add column if not exists contacto_nombre   text,
  add column if not exists contacto_cargo    text,
  add column if not exists contacto_celular  text,
  add column if not exists contacto_correo   text,
  add column if not exists perfil_completo   boolean not null default false;

-- 3. Documento OPCIONAL de composición accionaria (no bloquea aprobación)
alter table public.documentos_kyc drop constraint if exists documentos_kyc_tipo_documento_check;
alter table public.documentos_kyc
  add constraint documentos_kyc_tipo_documento_check
  check (tipo_documento in ('rut','camara_comercio','resolucion_dian','composicion_accionaria'));

-- 4. Registro mínimo: el trigger solo crea id + correo (sin datos de empresa)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles_usuarios (id, correo)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5. Aceptaciones (contrato de servicios + tratamiento de datos), ledger inmutable
create table if not exists public.aceptaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles_usuarios(id) on delete cascade,
  documento  text not null check (documento in ('contrato_servicios','tratamiento_datos')),
  version    text not null,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_aceptaciones_usuario
  on public.aceptaciones(usuario_id, documento);

alter table public.aceptaciones enable row level security;

drop policy if exists "aceptaciones: leer propias" on public.aceptaciones;
create policy "aceptaciones: leer propias" on public.aceptaciones
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "aceptaciones: registrar propias" on public.aceptaciones;
create policy "aceptaciones: registrar propias" on public.aceptaciones
  for insert to authenticated with check (usuario_id = auth.uid());
-- No update/delete: el ledger es inmutable.
```

- [ ] **Step 2: Jaime la corre** → `Success. No rows returned`.
- [ ] **Step 3: Verificar**

```sql
select column_name from information_schema.columns
 where table_name='perfiles_usuarios' and column_name in
 ('tipo_sociedad','direccion','rep_nombre','contacto_nombre','perfil_completo'); -- 5 filas
select policyname from pg_policies where tablename='aceptaciones';               -- 2 filas
select is_nullable from information_schema.columns
 where table_name='perfiles_usuarios' and column_name='razon_social';           -- YES
```

- [ ] **Step 4: Commit** `feat(db): fase 2.6 — perfil de empresa expandido, aceptaciones y registro mínimo`.

---

### Task O2: Tipos + validación de perfil (TDD)

**Files:** MOD `src/types/database.ts`; MOD `src/lib/validation/registro.ts`; Create `src/lib/validation/perfil.ts`; MOD `tests/validation/registro.test.ts`; Create `tests/validation/perfil.test.ts`.

- [ ] **Step 1: `src/types/database.ts`**
  - En `perfiles_usuarios.Row`: `razon_social` pasa a `string | null`; agregar todas las columnas nuevas (todas `string | null` salvo `perfil_completo: boolean`).
  - `TipoDoc`: agregar `'composicion_accionaria'` a la unión.
  - Agregar tipo `TipoAceptacion = 'contrato_servicios' | 'tratamiento_datos'`.
  - Agregar tabla `aceptaciones` a `Tables` (Row completo; `Insert`: `Omit<Row,'id'|'created_at'>`; `Update: never`; `Relationships: []`).

- [ ] **Step 2: `registroSchema` mínimo** — reemplazar `src/lib/validation/registro.ts`:

```ts
import { z } from 'zod'

export const registroSchema = z
  .object({
    correo: z.string().email('Correo electrónico inválido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  })

export type RegistroInput = z.infer<typeof registroSchema>
```

- [ ] **Step 3: Tests (fallan primero)** — `tests/validation/perfil.test.ts`:

```ts
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
```

- [ ] **Step 4: Implementar `src/lib/validation/perfil.ts`**

```ts
import { z } from 'zod'

const celular = z.string().regex(/^\d{7,10}$/, 'Número inválido (7 a 10 dígitos)')
const celularOpc = celular.or(z.literal('')).optional()

export const TIPOS_SOCIEDAD = [
  { valor: 'sas', etiqueta: 'S.A.S.' },
  { valor: 'sa', etiqueta: 'S.A.' },
  { valor: 'ltda', etiqueta: 'Ltda.' },
  { valor: 'persona_natural', etiqueta: 'Persona natural' },
  { valor: 'otra', etiqueta: 'Otra' },
] as const

export const TIPOS_DOC_REP = ['CC', 'CE', 'Pasaporte', 'NIT'] as const

export const perfilSchema = z.object({
  razonSocial: z.string().min(3, 'Ingrese la razón social registrada ante la DIAN'),
  nombreComercial: z.string().optional(),
  nit: z.string().regex(/^\d{8,10}(-\d)?$/, 'NIT inválido. Formato: 901234567-8'),
  tipoSociedad: z.enum(['sas', 'sa', 'ltda', 'persona_natural', 'otra']),
  sede: z.string().min(2, 'Ingrese el nombre de la sede principal'),
  direccion: z.string().min(5, 'Ingrese la dirección exacta de la sede principal'),
  ciudad: z.string().min(2, 'Seleccione la ciudad'),
  telefono: z.string().regex(/^\d{7,10}$/).or(z.literal('')).optional(),
  sitioWeb: z.string().url('URL inválida').or(z.literal('')).optional(),
  repNombre: z.string().min(3, 'Ingrese el nombre del representante legal'),
  repTipoDoc: z.enum(['CC', 'CE', 'Pasaporte', 'NIT']),
  repNumDoc: z.string().min(5, 'Ingrese el número de documento'),
  repCorreo: z.string().email('Correo del representante inválido'),
  repCelular: celular,
  contactoNombre: z.string().min(3, 'Ingrese el nombre de la persona de contacto'),
  contactoCargo: z.string().optional(),
  contactoCelular: celular,
  contactoCorreo: z.string().email('Correo de contacto inválido'),
  contactoWhatsapp: celularOpc,
})

export type PerfilInput = z.infer<typeof perfilSchema>

/** ¿El perfil de empresa ya fue completado? */
export function perfilCompleto(perfil: { perfil_completo: boolean } | null | undefined): boolean {
  return perfil?.perfil_completo === true
}
```

- [ ] **Step 5: Ajustar `tests/validation/registro.test.ts`** al nuevo schema mínimo (casos: acepta correo+password+confirmar iguales; rechaza contraseñas distintas; rechaza password <8; rechaza correo inválido). **Step 6:** `npm test` verde. **Step 7:** `npm run build`. **Step 8: Commit** `feat: validación del perfil de empresa y registro mínimo`.

---

### Task O3: Registro mínimo (cuenta)

**Files:** MOD `src/app/(auth)/actions.ts`, `src/app/(auth)/registro/registro-form.tsx`, `src/app/(auth)/registro/page.tsx`.

- [ ] **Step 1: `registrarse`** — validar con el nuevo `registroSchema`; `signUp` SOLO con email+password (sin `options.data`). En error, devolver `valores` con el correo (no el password). Mantener `redirect('/registro/confirmar')`.
- [ ] **Step 2: `registro-form.tsx`** — reducir a 3 campos: correo, contraseña, confirmar contraseña. Conservar el patrón `useActionState` + preservación del correo en error. Botón "Crear cuenta". Texto guía: "Solo necesita su correo y una contraseña. Después de confirmar el correo, completará el perfil de su empresa."
- [ ] **Step 3: `registro/page.tsx`** — título "Cree su cuenta"; mover la lista de documentos requeridos y el detalle de empresa fuera de aquí (irán en `/vinculacion`). Conservar el disclosure legal de BitWave y el mantra.
- [ ] **Step 4:** `npm run build && npm run lint && npm test`. **Step 5: Commit** `feat: registro reducido a cuenta (correo + contraseña)`.

---

### Task O4: Página de vinculación (perfil de empresa + documentos)

**Files:** Create `src/app/vinculacion/page.tsx`, `src/app/vinculacion/vinculacion-form.tsx`, `src/app/vinculacion/actions.ts`; MOD `src/app/dashboard/layout.tsx`.

- [ ] **Step 1: Gate de perfil incompleto** — en `src/app/dashboard/layout.tsx`, tras obtener el `user`, consultar `perfiles_usuarios.perfil_completo`; si es `false`, `redirect('/vinculacion')`. (El `/vinculacion` NO usa el dashboard layout — tiene su propio `SiteHeader`.)

- [ ] **Step 2: Server Action `guardarPerfil`** (`src/app/vinculacion/actions.ts`):
  - `'use server'`; validar con `perfilSchema.safeParse` mapeando los 19 campos del `formData`.
  - En error → `{ error: primer mensaje, valores: <formData crudo> }`.
  - En éxito → `update perfiles_usuarios` con todos los campos (mapear `contactoWhatsapp` → columna `whatsapp`) **y** `perfil_completo: true`, `where id = auth.uid()`; `revalidatePath('/dashboard')`; `redirect('/dashboard')`.
  - Tipo `PerfilState = { error: string | null; valores?: Record<string,string> }`.

- [ ] **Step 3: `vinculacion-form.tsx`** (client) — formulario seccionado con `useActionState`, reutilizando `CiudadCombobox` para `ciudad` y el patrón de preservación de valores en error (`state.valores` + `resetKey`). Definir los campos como config para no repetir JSX:

```ts
// Cada sección: { titulo, campos: Campo[] }.  tipo: 'text'|'tel'|'email'|'url'|'select'|'ciudad'
// select usa `opciones`. Los marcados req=true llevan asterisco y required.
const SECCIONES = [
  { titulo: 'Datos de la empresa', campos: [
    { name:'razonSocial', label:'Razón social', tipo:'text', req:true, placeholder:'Nutifinanzas S.A.S.' },
    { name:'nombreComercial', label:'Nombre comercial', tipo:'text' },
    { name:'nit', label:'NIT', tipo:'text', req:true, placeholder:'901234567-8' },
    { name:'tipoSociedad', label:'Tipo de sociedad', tipo:'select', req:true, opciones:TIPOS_SOCIEDAD },
    { name:'sede', label:'Sede principal', tipo:'text', req:true, placeholder:'Oviedo' },
    { name:'direccion', label:'Dirección exacta', tipo:'text', req:true, placeholder:'Cra 43A #6 Sur-15, Of. 201', full:true },
    { name:'ciudad', label:'Ciudad', tipo:'ciudad', req:true },
    { name:'telefono', label:'Teléfono fijo', tipo:'tel', placeholder:'6044442211' },
    { name:'sitioWeb', label:'Sitio web', tipo:'url', placeholder:'https://...' },
  ]},
  { titulo: 'Representante legal', campos: [
    { name:'repNombre', label:'Nombre completo', tipo:'text', req:true },
    { name:'repTipoDoc', label:'Tipo de documento', tipo:'select', req:true, opciones:TIPOS_DOC_REP.map(v=>({valor:v,etiqueta:v})) },
    { name:'repNumDoc', label:'Número de documento', tipo:'text', req:true },
    { name:'repCorreo', label:'Correo', tipo:'email', req:true },
    { name:'repCelular', label:'Celular', tipo:'tel', req:true },
  ]},
  { titulo: 'Persona de contacto', campos: [
    { name:'contactoNombre', label:'Nombre', tipo:'text', req:true },
    { name:'contactoCargo', label:'Cargo', tipo:'text' },
    { name:'contactoCelular', label:'Celular', tipo:'tel', req:true },
    { name:'contactoCorreo', label:'Correo', tipo:'email', req:true },
    { name:'contactoWhatsapp', label:'WhatsApp', tipo:'tel' },
  ]},
] as const
```

  Reglas de render: `full` ⇒ `sm:col-span-2`; `select` ⇒ `<select>` nativo estilizado con las clases del `Input` (Base UI no trae Select en este proyecto — usar `<select>` HTML con `name`, `required`, `defaultValue`); `ciudad` ⇒ `<CiudadCombobox>` + hidden input `name="ciudad"`; el resto ⇒ `<Input>`. `defaultValue={state.valores?.[name] ?? ''}` en todos, con `key` que incorpora `resetKey`.

- [ ] **Step 4: `vinculacion/page.tsx`** (server) — exige sesión; carga `perfiles_usuarios` (para prellenar si ya había datos) y `documentos_kyc`. Estructura:
  1. `SiteHeader`.
  2. Encabezado + intro breve (marketplace B2B, PCD, no ejecuta transacciones).
  3. **Aviso de confidencialidad** (destacado, con ícono `Lock` en verde): "La documentación e información que suministre es **confidencial**. Solo se usa para validar la identidad de su empresa y dar seguridad a los demás usuarios de la plataforma. No se comparte con terceros."
  4. `<VinculacionForm valores={...} />` (perfil).
  5. Sección **Documentos** (reutiliza `DocumentoUploader` para los 3 requeridos con `ETIQUETAS_DOCUMENTO`/`DESCRIPCIONES_DOCUMENTO`) + un `DocumentoUploader` para `composicion_accionaria` etiquetado **"Composición accionaria (opcional)"**.
  6. El botón "Guardar perfil" del formulario hace el `guardarPerfil`; los documentos suben aparte (flujo directo a Storage ya existente). Nota de UX en la página: "Puede guardar el perfil y subir los documentos en cualquier orden; ambos son necesarios para la revisión."

- [ ] **Step 5:** Verificar que `DocumentoUploader` acepta `composicion_accionaria` — su prop `tipo` es `TipoDoc`, que en Task O2 ya incluye el nuevo valor; `validarArchivoKyc` no cambia. **Step 6:** `npm run build && npm run lint && npm test`. **Step 7: Commit** `feat: página de vinculación con perfil de empresa, confidencialidad y documentos`.

---

### Task O5: Contrato de servicios + aceptación digital

**Files:** Create `src/lib/legal/contrato.ts`, `src/app/contrato/page.tsx`, `src/app/contrato/contrato-form.tsx`, `src/app/contrato/actions.ts`; MOD `src/app/dashboard/page.tsx`.

- [ ] **Step 1: Texto legal versionado** — `src/lib/legal/contrato.ts`:

```ts
// El TEXTO es un placeholder para que Jaime lo reemplace (idealmente revisado por
// abogado del sector cambiario). La plataforma versiona y registra la aceptación.
export const CONTRATO_VERSION = 'v1-2026-07'
export const TRATAMIENTO_VERSION = 'v1-2026-07'

export const CONTRATO_SERVICIOS = `
CONTRATO DE PRESTACIÓN DE SERVICIOS — TASA DIRECTA (BitWave S.A.S., NIT 901.920.120-1)

[TEXTO PENDIENTE DE APROBACIÓN LEGAL]
Objeto: Tasa Directa es un marketplace B2B que conecta a Profesionales de Compra y
Venta de Divisas (PCD). La plataforma NO ejecuta ni intermedia transacciones
cambiarias; las operaciones se pactan y cierran directamente entre las partes.
...
`.trim()

export const TRATAMIENTO_DATOS = `
AUTORIZACIÓN DE TRATAMIENTO DE DATOS PERSONALES (Ley 1581 de 2012)

[TEXTO PENDIENTE DE APROBACIÓN LEGAL]
Responsable: BitWave S.A.S. Finalidad: validar la identidad de la empresa y sus
representantes, y dar seguridad a los usuarios de la plataforma. La información es
confidencial y no se comparte con terceros salvo obligación legal.
...
`.trim()
```

- [ ] **Step 2: Server Action `aceptarTerminos`** (`src/app/contrato/actions.ts`):
  - `'use server'`; exige sesión y que el usuario esté **aprobado** (`perfiles_usuarios.estado = 'aprobado'`), si no → error.
  - Requiere que ambos checkboxes vengan marcados (contrato + tratamiento). Si falta uno → error.
  - Captura `ip` desde `headers()` (`x-forwarded-for` → primer valor; Next 16: `await headers()`) y `user_agent`.
  - Inserta DOS filas en `aceptaciones` (una por documento) con su versión respectiva, ip, user_agent. Idempotencia suave: si ya existen para esas versiones, no duplicar (consultar antes o `on conflict`-libre: verificar existencia).
  - `revalidatePath('/dashboard')`; `redirect('/dashboard')`.

- [ ] **Step 3: `contrato-form.tsx`** (client, `useActionState`) — dos bloques scrollables (`max-h-64 overflow-y-auto` con el texto), cada uno con su checkbox ("He leído y acepto el contrato de servicios" / "Autorizo el tratamiento de mis datos personales"), y botón "Aceptar y continuar" (deshabilitado hasta marcar ambos, validado también server-side). Mostrar error de `state`.

- [ ] **Step 4: `contrato/page.tsx`** (server) — exige sesión; si `estado !== 'aprobado'` → redirige a `/dashboard` (la puerta del contrato solo aplica tras aprobación); si ya aceptó la versión vigente → redirige a `/dashboard`. Render con `SiteHeader` + `<ContratoForm />`.

- [ ] **Step 5: Card de contrato en el dashboard** (`dashboard/page.tsx`) — cuando `estado === 'aprobado'`:
  - Consultar si existe aceptación vigente (`aceptaciones` para `contrato_servicios` con `version = CONTRATO_VERSION`).
  - Si **no** aceptado → card destacada "Falta un paso: acepte el contrato de servicios" con botón a `/contrato`, y la card de Membresía muestra "Se habilita tras aceptar el contrato".
  - Si aceptado → nota "Contrato aceptado" con fecha.

- [ ] **Step 6:** `npm run build && npm run lint && npm test`. **Step 7: Commit** `feat: contrato de servicios con aceptación digital y trazabilidad`.

---

### Task O6: Expediente admin — perfil completo, composición y estado del contrato

**Files:** Create `src/app/admin/usuarios/[id]/perfil-empresa.tsx`; MOD `src/app/admin/usuarios/[id]/page.tsx`.

- [ ] **Step 1: `perfil-empresa.tsx`** (server, solo lectura) — recibe el `perfil` y lo muestra en secciones (Empresa / Representante / Contacto) con etiquetas legibles y `'—'` para nulos. Usar `TIPOS_SOCIEDAD` para mostrar la etiqueta del tipo de sociedad.
- [ ] **Step 2: `page.tsx`** — 
  - Ampliar el `select('*')` del perfil ya cubre las columnas nuevas.
  - Renderizar `<PerfilEmpresa perfil={perfil} />` bajo el encabezado de la tarjeta del PCD.
  - En la sección Documentos, incluir `composicion_accionaria` como fila opcional (mostrar "Composición accionaria (opcional)" y su badge/enlace si existe; su ausencia NO impide aprobar).
  - Consultar `aceptaciones` del usuario y mostrar un renglón "Contrato de servicios: Aceptado el {fecha} (v…)" o "Pendiente".
- [ ] **Step 3:** `npm run build && npm run lint && npm test`. **Step 4: Commit** `feat: expediente admin muestra perfil completo, composición accionaria y estado del contrato`.

---

### Task O7: Documentación, verificación final y deploy a Preview

- [ ] **Step 1: README** — actualizar el flujo de onboarding (3 etapas), agregar Fase 2.6 al roadmap como completada.
- [ ] **Step 2:** `npm test && npm run lint && npm run build` → verde; rutas nuevas listadas (`/vinculacion`, `/contrato`).
- [ ] **Step 3:** `git push` (rama `fase-2-kyc`) → Preview de Vercel.
- [ ] **Step 4: Checklist E2E para Jaime** (requiere la migration 0004 corrida):
  1. `/registro` pide solo correo + contraseña + confirmar → llega correo → confirma.
  2. Al entrar, redirige a `/vinculacion` (perfil incompleto). Ver aviso de confidencialidad.
  3. Llenar el perfil (secciones Empresa/Representante/Contacto), subir los 3 documentos + (opcional) composición accionaria. Guardar → cae al dashboard con estado "Pendiente".
  4. Admin → expediente: ve el perfil completo, los documentos (incl. composición si se subió) y "Contrato: Pendiente". Aprueba los 3 → "Aprobar PCD" → Telegram avisa.
  5. El PCD ve en el dashboard la card "Acepte el contrato de servicios" → `/contrato` → marca ambos checkboxes → aceptar. Vuelve al dashboard con "Contrato aceptado".
  6. Admin activa membresía (Fase 2.5) → el PCD ve "Membresía activa".
- [ ] **Step 5: Commit** `docs: onboarding en 3 etapas (cuenta, perfil, contrato) documentado`. El merge a `master` sigue pendiente del E2E completo de toda la rama.

---

## Fuera de alcance (no implementar ahora)

- E-firma PDF formal (DocuSeal/Zapsign) → se deja el ledger `aceptaciones` como base; se enchufa a futuro.
- Sedes múltiples por empresa → Fase 3.
- Bloqueo por DB de la aceptación del contrato como pre-requisito de publicar ofertas → Fase 3 (hoy el mercado aún no existe; se gatea a nivel de app en el dashboard).
- Texto legal definitivo del contrato y del tratamiento de datos → lo aporta Jaime (revisado por abogado); el código versiona y registra.
- Recuperación de contraseña → incremento posterior.

## Riesgos y notas para el ejecutor

1. **Orden:** la migration 0004 (O1) debe correrla Jaime ANTES de probar O3–O6 en Preview (el código compila sin ella, pero las consultas a las columnas/tabla nuevas fallarían en runtime).
2. `razon_social` ahora es nullable: las vistas/consultas que la usan ya manejan `null` con `'—'`; verificar `perfiles_publicos` (la vista sigue igual, solo que puede devolver null hasta que el perfil se complete — aceptable).
3. Base UI: `render` (no `asChild`); `<form action>` con wrapper-void; `<select>` nativo (no hay componente Select en el proyecto).
4. El `DocumentoUploader` se reutiliza tal cual; solo cambia el conjunto de `TipoDoc` permitido (O2).
5. Captura de IP: en Vercel usar `x-forwarded-for` (primer valor). Nunca confiar en datos de IP/versión provenientes del cliente — se fijan server-side.
6. Terminología y "Seguridad y Confianza" en todo el copy nuevo (registro, vinculación, contrato).
```
