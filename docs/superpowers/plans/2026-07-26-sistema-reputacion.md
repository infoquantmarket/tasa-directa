# Sistema de Reputación entre PCD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que las dos partes de un trato cerrado se califiquen mutuamente (1-5 estrellas + comentario opcional), mostrar el promedio públicamente en el tablero para desincentivar el abuso, y darle al admin una vista de acordeón por usuario con el detalle completo (incluidos comentarios) para investigar y, si hace falta, eliminar una calificación injusta.

**Architecture:** Extensión aditiva sobre el marketplace ya existente. Se agrega `ofertas.interlocutor_id` (snapshot de la contraparte, grabado por las funciones que ya cierran un trato), una tabla `calificaciones` nueva, una función `security definer` (`calificar_contraparte`) que aplica las reglas de negocio, y una vista pública `reputacion_usuarios` (solo promedio + total, sin comentarios). El resto es UI: badge de estrellas en el tablero, un banner con modal de calificación en "Mis ofertas"/"Mis intenciones", y una sección de acordeón en el expediente admin.

**Tech Stack:** Next.js App Router (Server Actions), TypeScript, Supabase (Postgres + RLS + funciones `security definer`), zod + Vitest (TDD), Tailwind + shadcn/ui (Base UI `Dialog`), lucide-react (`Star`, `ChevronDown`). Sin librerías nuevas.

**Spec:** [`docs/superpowers/specs/2026-07-26-sistema-reputacion-design.md`](../specs/2026-07-26-sistema-reputacion-design.md)

---

## Contexto imprescindible para el ejecutor (sin memoria del proyecto)

- **El ciclo de negociación YA EXISTE** (`supabase/migrations/0007_marketplace_ofertas.sql`, ajustado en `0011`/`0013`): una oferta pasa `activa` → `en_negociacion` (al recibir una intención) → `completada` (vía `completar_oferta()` o `aceptar_intencion()`) o vuelve a `activa` (vía `cerrar_negociacion_sin_acuerdo()`, sin trato). Solo hay **una** intención no cerrada a la vez por oferta — eso es lo que permite identificar sin ambigüedad quién fue la contraparte de un cierre.
- **Este plan solo AMPLÍA (`create or replace`) `completar_oferta()` y `aceptar_intencion()`** — no las reescribe. Las versiones vigentes hoy están en `supabase/migrations/0011_expiracion_y_aceptacion.sql` líneas 60-84 y 126-169 respectivamente (no hay overrides posteriores de esas dos funciones). El código de abajo ya parte de esas versiones exactas.
- **RLS de `ofertas` ya deja ver una oferta `completada` tanto al dueño (`usuario_id = auth.uid()`) como a quien respondió** (`public.tiene_intencion_propia_en(id)`, función definida en `0009_fix_recursion_rls_ofertas.sql`, sin filtro de estado de la intención) — así que la consulta de "tratos por calificar" no necesita el cliente de servicio, funciona con el cliente normal del usuario autenticado.
- **Patrón de funciones RPC de negocio:** `security definer`, `set search_path = public`, `raise exception '...' using errcode = 'check_violation'` (o `'insufficient_privilege'`) con mensajes en español pensados para mostrarse tal cual al usuario. Ver `completar_oferta`/`cerrar_negociacion_sin_acuerdo` como referencia exacta de estilo.
- **Aplicación de migraciones:** Jaime corre el SQL manualmente en el SQL Editor de Supabase — no hay CLI local. Cada task de migración deja el archivo listo, no lo ejecuta.
- **⚠️ Gating de despliegue:** esta migración modifica dos funciones que se ejecutan CADA VEZ que un trato se cierra en producción (`completar_oferta`, `aceptar_intencion`). Si se pushea el código de la app a `master` antes de que la migración esté corrida, cerrar cualquier trato en producción fallaría por completo (columna `interlocutor_id` inexistente). Seguir la misma disciplina que con la migration 0015 (filtro por zona): commitear todo en `fase-2-kyc`, avisar explícitamente a Jaime cuál migración correr, y NO hacer merge a `master` hasta que confirme que la corrió — idealmente verificando con una consulta de servicio que `interlocutor_id` quedó disponible antes de fusionar.
- **`Dialog`, `Textarea`, `Button`, `Card`, `Alert`** de shadcn/ui (Base UI) ya están en `src/components/ui/`. `Button` usa el prop `render` para polimorfismo (NO `asChild`).
- **Patrón de disclosure sin librería de acordeón:** este proyecto no tiene un componente Accordion instalado. Para el "historial reciente" en Mis Ofertas se usa `<details>/<summary>` nativo; para el chatbot de FAQ se usa un `useState` + botón con `ChevronDown` que gira. La sección de Reputación del admin (Task REP7) sigue este segundo patrón, porque necesita mostrar el promedio en el encabezado SIEMPRE visible (algo que `<summary>` también podría hacer, pero el botón custom da más control sobre el layout del encabezado).
- Verificación estándar del proyecto: `npx tsc --noEmit`, `npm test`, revisión manual en navegador (obligatoria aquí por tocar triggers de Postgres).

## File Structure

- **Create** `supabase/migrations/0016_reputacion.sql` — columna, tabla, función, vista, RLS.
- **Modify** `src/types/database.ts` — `ofertas.Row`/`Insert`, tabla `calificaciones`, vista `reputacion_usuarios`, función `calificar_contraparte`.
- **Create** `src/lib/validation/calificacion.ts` — `calificacionSchema`.
- **Test** `tests/validation/calificacion.test.ts`.
- **Modify** `src/app/ofertas/actions.ts` — exportar `mensajeDesdeError` para reutilizarlo.
- **Create** `src/app/ofertas/calificaciones-actions.ts` — `calificarContraparte`.
- **Create** `src/lib/ofertas/tratos-por-calificar.ts` — `tratosPorCalificar(usuarioId)`.
- **Modify** `src/app/ofertas/tarjeta-oferta.tsx` — badge de estrellas (opcional, solo si se pasa `reputacion`).
- **Modify** `src/app/ofertas/page.tsx` — trae `reputacion_usuarios` de las empresas visibles.
- **Create** `src/app/ofertas/modal-calificar.tsx` — diálogo de 1-5 estrellas + comentario.
- **Create** `src/app/ofertas/banner-por-calificar.tsx` — lista de tratos pendientes de calificar.
- **Modify** `src/app/ofertas/mis-ofertas/page.tsx` — agrega el banner.
- **Modify** `src/app/ofertas/mis-intenciones/page.tsx` — agrega el banner.
- **Create** `src/app/admin/usuarios/[id]/reputacion.tsx` — acordeón + botón eliminar.
- **Modify** `src/app/admin/actions.ts` — `eliminarCalificacion`.
- **Modify** `src/app/admin/usuarios/[id]/page.tsx` — trae calificaciones e inserta `<Reputacion />`.

---

### Task REP1: Migration 0016 — interlocutor_id, calificaciones, calificar_contraparte, reputacion_usuarios

**Files:**
- Create: `supabase/migrations/0016_reputacion.sql`

- [ ] **Step 1: Escribir la migration completa**

```sql
-- =============================================================================
-- TASA DIRECTA · Sistema de reputación entre PCD
--
-- 1) ofertas.interlocutor_id — snapshot inmutable de la contraparte del trato,
--    grabado únicamente por completar_oferta()/aceptar_intencion() al cerrar
--    (nunca por el cliente). Ofertas completadas ANTES de este cambio quedan
--    con interlocutor_id = null y simplemente no se pueden calificar.
-- 2) Tabla calificaciones: 1-5 estrellas + comentario opcional, inmutable.
--    Nadie inserta directo (solo vía calificar_contraparte); cada quien ve
--    sus propias calificaciones enviadas; el admin ve y borra todo.
-- 3) calificar_contraparte(): valida trato completado + participación, e
--    infiere automáticamente a quién se califica (evita que alguien invente
--    calificaciones sobre tratos ajenos).
-- 4) Vista reputacion_usuarios: promedio + total, pública (SIN comentarios ni
--    calificador_id) — segura para mostrar estrellas en el tablero a
--    cualquier PCD sin exponer el texto que escribió nadie.
-- Idempotente.
-- =============================================================================

-- 1. Columna interlocutor_id en ofertas ------------------------------------------
alter table public.ofertas
  add column if not exists interlocutor_id uuid references public.perfiles_usuarios(id);

-- 2. completar_oferta: graba el interlocutor al completar (mismas reglas de
--    antes, solo se agrega v_interlocutor + el campo en el update) -------------
create or replace function public.completar_oferta(p_oferta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dueno        uuid;
  v_estado       text;
  v_interlocutor uuid;
begin
  select usuario_id, estado into v_dueno, v_estado
  from public.ofertas where id = p_oferta_id for update;

  if v_estado is distinct from 'en_negociacion' then
    raise exception 'Esta oferta no está en negociación.'
      using errcode = 'check_violation';
  end if;
  if v_dueno <> auth.uid() then
    raise exception 'Solo el dueño de la oferta puede completarla.'
      using errcode = 'insufficient_privilege';
  end if;

  -- El ciclo de negociación solo permite una intención no cerrada a la vez
  -- por oferta — esa es la contraparte real del trato.
  select usuario_id into v_interlocutor
  from public.intenciones
  where oferta_id = p_oferta_id and estado in ('enviada','vista','aceptada')
  limit 1;

  update public.ofertas
    set estado = 'completada', interlocutor_id = v_interlocutor, updated_at = now()
  where id = p_oferta_id;

  update public.intenciones set estado = 'cerrada', updated_at = now()
  where oferta_id = p_oferta_id and estado in ('enviada','vista','aceptada');
end;
$$;

-- 3. aceptar_intencion: graba el interlocutor al aceptar (mismas reglas de
--    antes, solo se agrega v_interlocutor + el campo en el update) -------------
create or replace function public.aceptar_intencion(p_intencion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_oferta_id    uuid;
  v_dueno        uuid;
  v_estado_of    text;
  v_estado_in    text;
  v_interlocutor uuid;
begin
  select i.oferta_id, i.estado, o.usuario_id, o.estado, i.usuario_id
    into v_oferta_id, v_estado_in, v_dueno, v_estado_of, v_interlocutor
  from public.intenciones i
  join public.ofertas o on o.id = i.oferta_id
  where i.id = p_intencion_id
  for update of i, o;

  if v_dueno is null then
    raise exception 'Intención no encontrada.' using errcode = 'check_violation';
  end if;
  if v_dueno <> auth.uid() then
    raise exception 'Solo el dueño de la oferta puede aceptar esta intención.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_estado_in not in ('enviada','vista') then
    raise exception 'Esta intención ya fue procesada.'
      using errcode = 'check_violation';
  end if;
  if v_estado_of is distinct from 'en_negociacion' then
    raise exception 'La oferta no está en negociación.'
      using errcode = 'check_violation';
  end if;

  update public.intenciones set estado = 'aceptada', updated_at = now()
  where id = p_intencion_id;

  update public.ofertas
    set estado = 'completada', interlocutor_id = v_interlocutor, updated_at = now()
  where id = v_oferta_id;

  -- Cerrar el resto de intenciones sobre esa oferta (por si hubiera colgadas).
  update public.intenciones set estado = 'cerrada', updated_at = now()
  where oferta_id = v_oferta_id
    and id <> p_intencion_id
    and estado in ('enviada','vista');
end;
$$;

-- 4. Tabla calificaciones ---------------------------------------------------------
create table if not exists public.calificaciones (
  id             uuid primary key default gen_random_uuid(),
  oferta_id      uuid not null references public.ofertas(id),
  calificador_id uuid not null references public.perfiles_usuarios(id),
  calificado_id  uuid not null references public.perfiles_usuarios(id),
  estrellas      smallint not null check (estrellas between 1 and 5),
  comentario     text,
  created_at     timestamptz not null default now(),
  unique (oferta_id, calificador_id)
);

alter table public.calificaciones enable row level security;

drop policy if exists "calificaciones: sin insert directo" on public.calificaciones;
create policy "calificaciones: sin insert directo" on public.calificaciones
  for insert to authenticated with check (false);

drop policy if exists "calificaciones: propio calificador lee" on public.calificaciones;
create policy "calificaciones: propio calificador lee" on public.calificaciones
  for select to authenticated using (calificador_id = auth.uid());

drop policy if exists "calificaciones: admin lee todo" on public.calificaciones;
create policy "calificaciones: admin lee todo" on public.calificaciones
  for select to authenticated using (public.es_admin());

drop policy if exists "calificaciones: admin elimina" on public.calificaciones;
create policy "calificaciones: admin elimina" on public.calificaciones
  for delete to authenticated using (public.es_admin());

-- Nadie actualiza: es inmutable. Para corregir, el admin elimina (RLS de arriba).

-- 5. Función calificar_contraparte ------------------------------------------------
create or replace function public.calificar_contraparte(
  p_oferta_id uuid, p_estrellas smallint, p_comentario text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_dueno        uuid;
  v_interlocutor uuid;
  v_estado       text;
  v_calificado   uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = 'insufficient_privilege';
  end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5 then
    raise exception 'La calificación debe ser entre 1 y 5 estrellas.'
      using errcode = 'check_violation';
  end if;

  select usuario_id, interlocutor_id, estado into v_dueno, v_interlocutor, v_estado
  from public.ofertas where id = p_oferta_id;

  if v_dueno is null then
    raise exception 'Oferta no encontrada.' using errcode = 'check_violation';
  end if;
  if v_estado is distinct from 'completada' then
    raise exception 'Solo se puede calificar un trato completado.'
      using errcode = 'check_violation';
  end if;
  if v_interlocutor is null then
    raise exception 'Este trato no tiene una contraparte registrada para calificar.'
      using errcode = 'check_violation';
  end if;
  if v_uid <> v_dueno and v_uid <> v_interlocutor then
    raise exception 'No participó en este trato.' using errcode = 'insufficient_privilege';
  end if;

  v_calificado := case when v_uid = v_dueno then v_interlocutor else v_dueno end;

  insert into public.calificaciones (oferta_id, calificador_id, calificado_id, estrellas, comentario)
  values (p_oferta_id, v_uid, v_calificado, p_estrellas, nullif(trim(both from coalesce(p_comentario, '')), ''));
end;
$$;

-- 6. Vista pública reputacion_usuarios --------------------------------------------
-- Sin `security_invoker`: corre con los privilegios del dueño de la vista (el
-- rol que aplica la migración), igual que perfiles_publicos — así agrega
-- sobre TODAS las calificaciones, no solo las que el usuario que consulta
-- podría ver por su propia RLS (que sería solo las que él mismo envió).
create or replace view public.reputacion_usuarios as
select
  calificado_id as usuario_id,
  round(avg(estrellas)::numeric, 1) as promedio,
  count(*) as total
from public.calificaciones
group by calificado_id;

grant select on public.reputacion_usuarios to authenticated;
```

- [ ] **Step 2: Verificar que el archivo quedó bien escrito**

Run: `cat supabase/migrations/0016_reputacion.sql`
Expected: el contenido de arriba. (La aplicación real la corre Jaime en el SQL Editor de Supabase — avisarle explícitamente cuál archivo correr y NO fusionar a `master` hasta que confirme.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_reputacion.sql
git commit -m "feat(db): migration 0016 — sistema de reputacion (interlocutor_id, calificaciones, calificar_contraparte)"
```

---

### Task REP2: Tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Ampliar `ofertas.Row`/`Insert` con `interlocutor_id`**

Reemplazar:

```ts
      ofertas: {
        Row: {
          id:         string
          usuario_id: string
          empresa:    string
          sede:       string | null
          ciudad:     string | null
          operacion:  Operacion | null
          moneda:     Moneda
          cantidad:   number
          precio_cop: number
          condiciones: Condicion[]
          estado:     EstadoOferta
          notas:      string | null
          destacada:  boolean
          expira_en:  string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['ofertas']['Row'], 'id' | 'expira_en' | 'destacada' | 'created_at' | 'updated_at'> & { expira_en?: string; destacada?: boolean }
        Update: Partial<Pick<Database['public']['Tables']['ofertas']['Row'], 'cantidad' | 'precio_cop' | 'estado' | 'destacada'>>
        Relationships: []
      }
```

por:

```ts
      ofertas: {
        Row: {
          id:              string
          usuario_id:      string
          empresa:         string
          sede:            string | null
          ciudad:          string | null
          operacion:       Operacion | null
          moneda:          Moneda
          cantidad:        number
          precio_cop:      number
          condiciones:     Condicion[]
          estado:          EstadoOferta
          notas:           string | null
          interlocutor_id: string | null
          destacada:       boolean
          expira_en:       string
          created_at:      string
          updated_at:      string
        }
        Insert: Omit<Database['public']['Tables']['ofertas']['Row'], 'id' | 'expira_en' | 'destacada' | 'created_at' | 'updated_at' | 'interlocutor_id'> & { expira_en?: string; destacada?: boolean }
        Update: Partial<Pick<Database['public']['Tables']['ofertas']['Row'], 'cantidad' | 'precio_cop' | 'estado' | 'destacada'>>
        Relationships: []
      }
```

(`interlocutor_id` queda fuera de `Insert` a propósito: solo lo graban `completar_oferta()`/`aceptar_intencion()` vía RPC, nunca un insert directo del cliente.)

- [ ] **Step 2: Agregar la tabla `calificaciones`**

Insertar, justo después del bloque de `intenciones` (antes de `token_saldos`):

```ts
      calificaciones: {
        Row: {
          id:             string
          oferta_id:      string
          calificador_id: string
          calificado_id:  string
          estrellas:      number
          comentario:     string | null
          created_at:     string
        }
        Insert: never   // solo escribe calificar_contraparte()
        Update: never
        Relationships: []
      }
```

- [ ] **Step 3: Agregar la vista `reputacion_usuarios`**

Dentro de `Views`, junto a `perfiles_publicos`:

```ts
      reputacion_usuarios: {
        Row: {
          usuario_id: string
          promedio:   number
          total:      number
        }
        Relationships: []
      }
```

- [ ] **Step 4: Agregar la función `calificar_contraparte`**

Reemplazar:

```ts
      destacar_oferta: { Args: { p_oferta_id: string }; Returns: void }
    }
  }
}
```

por:

```ts
      destacar_oferta: { Args: { p_oferta_id: string }; Returns: void }
      calificar_contraparte: {
        Args: { p_oferta_id: string; p_estrellas: number; p_comentario?: string }
        Returns: void
      }
    }
  }
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(reputacion): tipos de interlocutor_id, calificaciones, reputacion_usuarios y calificar_contraparte"
```

---

### Task REP3: Validación de calificación (TDD)

**Files:**
- Create: `src/lib/validation/calificacion.ts`
- Test: `tests/validation/calificacion.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/validation/calificacion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calificacionSchema } from '@/lib/validation/calificacion'

describe('calificacionSchema', () => {
  it('acepta de 1 a 5 estrellas sin comentario', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(calificacionSchema.safeParse({ estrellas: String(n), comentario: '' }).success).toBe(true)
    }
  })
  it('acepta un comentario opcional', () => {
    expect(calificacionSchema.safeParse({
      estrellas: '5', comentario: 'Cumplió todo a tiempo, excelente contraparte.',
    }).success).toBe(true)
  })
  it('rechaza 0 estrellas', () => {
    expect(calificacionSchema.safeParse({ estrellas: '0', comentario: '' }).success).toBe(false)
  })
  it('rechaza 6 estrellas', () => {
    expect(calificacionSchema.safeParse({ estrellas: '6', comentario: '' }).success).toBe(false)
  })
  it('rechaza estrellas no numéricas', () => {
    expect(calificacionSchema.safeParse({ estrellas: 'muchas', comentario: '' }).success).toBe(false)
  })
  it('rechaza sin estrellas', () => {
    expect(calificacionSchema.safeParse({ comentario: '' }).success).toBe(false)
  })
  it('rechaza un comentario de más de 500 caracteres', () => {
    expect(calificacionSchema.safeParse({ estrellas: '5', comentario: 'a'.repeat(501) }).success).toBe(false)
  })
  it('acepta exactamente 500 caracteres', () => {
    expect(calificacionSchema.safeParse({ estrellas: '5', comentario: 'a'.repeat(500) }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/validation/calificacion.test.ts`
Expected: FAIL — módulo `@/lib/validation/calificacion` no encontrado.

- [ ] **Step 3: Crear `src/lib/validation/calificacion.ts`**

```ts
import { z } from 'zod'

export const calificacionSchema = z.object({
  estrellas: z.coerce.number().int()
    .min(1, 'Debe seleccionar entre 1 y 5 estrellas.')
    .max(5, 'Debe seleccionar entre 1 y 5 estrellas.'),
  comentario: z.string().max(500, 'El comentario no puede superar 500 caracteres.').optional(),
})

export type CalificacionInput = z.infer<typeof calificacionSchema>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/validation/calificacion.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/calificacion.ts tests/validation/calificacion.test.ts
git commit -m "feat(reputacion): validación zod de calificar contraparte (TDD)"
```

---

### Task REP4: Server Actions — calificar contraparte y tratos pendientes

**Files:**
- Modify: `src/app/ofertas/actions.ts`
- Create: `src/app/ofertas/calificaciones-actions.ts`
- Create: `src/lib/ofertas/tratos-por-calificar.ts`

- [ ] **Step 1: Exportar `mensajeDesdeError` para reutilizarlo**

En `src/app/ofertas/actions.ts`, reemplazar:

```ts
function mensajeDesdeError(
```

por:

```ts
export function mensajeDesdeError(
```

(Es la única línea que cambia — la función sigue igual, solo se vuelve exportable para que `calificaciones-actions.ts` la reutilice en vez de duplicar la traducción de errores de Postgres.)

- [ ] **Step 2: Crear `src/lib/ofertas/tratos-por-calificar.ts`**

```ts
import { createClient } from '@/lib/supabase/server'

export interface TratoPorCalificar {
  ofertaId: string
  contraparte: string
  resumen: string
}

/**
 * Ofertas completadas donde `usuarioId` participó (como dueño o como quien
 * respondió) y que todavía no calificó. RLS ya deja ver una oferta
 * 'completada' tanto al dueño como a quien tuvo una intención sobre ella
 * (public.tiene_intencion_propia_en), así que esto funciona con el cliente
 * normal del usuario — no hace falta el cliente de servicio.
 */
export async function tratosPorCalificar(usuarioId: string): Promise<TratoPorCalificar[]> {
  const supabase = await createClient()

  const { data: ofertas } = await supabase
    .from('ofertas')
    .select('id, empresa, operacion, moneda, cantidad, precio_cop, usuario_id, interlocutor_id')
    .eq('estado', 'completada')
    .not('interlocutor_id', 'is', null)
    .or(`usuario_id.eq.${usuarioId},interlocutor_id.eq.${usuarioId}`)

  if (!ofertas?.length) return []

  const { data: yaCalificadas } = await supabase
    .from('calificaciones')
    .select('oferta_id')
    .eq('calificador_id', usuarioId)
    .in('oferta_id', ofertas.map((o) => o.id))

  const idsYaCalificados = new Set((yaCalificadas ?? []).map((c) => c.oferta_id))
  const pendientes = ofertas.filter((o) => !idsYaCalificados.has(o.id))
  if (!pendientes.length) return []

  const idsContrapartes = pendientes.map((o) => (o.usuario_id === usuarioId ? o.interlocutor_id! : o.usuario_id))
  const { data: contrapartes } = await supabase
    .from('perfiles_publicos')
    .select('id, razon_social')
    .in('id', idsContrapartes)
  const nombrePorId = new Map((contrapartes ?? []).map((c) => [c.id, c.razon_social]))

  return pendientes.map((o) => {
    const contraparteId = o.usuario_id === usuarioId ? o.interlocutor_id! : o.usuario_id
    return {
      ofertaId: o.id,
      contraparte: nombrePorId.get(contraparteId) ?? 'Contraparte',
      resumen: `${o.operacion === 'venta' ? 'Vende' : 'Compra'} ${o.moneda} ${o.cantidad.toLocaleString('es-CO')} a $${o.precio_cop.toLocaleString('es-CO')} COP`,
    }
  })
}
```

- [ ] **Step 3: Crear `src/app/ofertas/calificaciones-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { calificacionSchema } from '@/lib/validation/calificacion'
import { mensajeDesdeError, type AccionState } from './actions'

export async function calificarContraparte(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  const parsed = calificacionSchema.safeParse({
    estrellas: formData.get('estrellas'),
    comentario: formData.get('comentario'),
  })

  if (!ofertaId) return { error: 'Solicitud inválida.' }
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('calificar_contraparte', {
    p_oferta_id: ofertaId,
    p_estrellas: parsed.data.estrellas,
    p_comentario: parsed.data.comentario || undefined,
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ya calificó este trato.' }
    return { error: mensajeDesdeError(error) }
  }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/ofertas/actions.ts src/app/ofertas/calificaciones-actions.ts src/lib/ofertas/tratos-por-calificar.ts
git commit -m "feat(reputacion): server action calificarContraparte y helper de tratos pendientes"
```

---

### Task REP5: Estrellas en el tablero de ofertas

**Files:**
- Modify: `src/app/ofertas/tarjeta-oferta.tsx`
- Modify: `src/app/ofertas/page.tsx`

- [ ] **Step 1: Agregar `reputacion` (opcional) a `DatosOferta`**

En `src/app/ofertas/tarjeta-oferta.tsx`, reemplazar:

```ts
export interface DatosOferta {
  id: string
  empresa: string
  sede: string | null
  ciudad: string | null
  operacion: Operacion | null
  moneda: Moneda
  cantidad: number
  precioCop: number
  condiciones: Condicion[]
  notas: string | null
  expiraEn: string
  destacada?: boolean
}
```

por:

```ts
export interface DatosOferta {
  id: string
  empresa: string
  sede: string | null
  ciudad: string | null
  operacion: Operacion | null
  moneda: Moneda
  cantidad: number
  precioCop: number
  condiciones: Condicion[]
  notas: string | null
  expiraEn: string
  destacada?: boolean
  /** Solo se pasa desde el tablero (`/ofertas`); si se omite, no se muestra la línea de estrellas. */
  reputacion?: { promedio: number; total: number } | null
}
```

- [ ] **Step 2: Renderizar el badge de estrellas**

Reemplazar:

```tsx
            <CardDescription className="mt-1.5">
              {oferta.empresa}
              {oferta.sede ? ` · ${oferta.sede}` : ''}
              {oferta.ciudad ? ` · ${soloCiudad(oferta.ciudad)}` : ''}
            </CardDescription>
          </div>
```

por:

```tsx
            <CardDescription className="mt-1.5">
              {oferta.empresa}
              {oferta.sede ? ` · ${oferta.sede}` : ''}
              {oferta.ciudad ? ` · ${soloCiudad(oferta.ciudad)}` : ''}
            </CardDescription>
            {oferta.reputacion !== undefined && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {oferta.reputacion ? (
                  <>
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {oferta.reputacion.promedio.toFixed(1)} ({oferta.reputacion.total})
                  </>
                ) : (
                  'Sin calificaciones aún'
                )}
              </p>
            )}
          </div>
```

- [ ] **Step 3: Traer `reputacion_usuarios` en el tablero**

En `src/app/ofertas/page.tsx`, reemplazar el select de ofertas:

```ts
  const { data: ofertas, error: errorOfertas } = puedeVerMercado
    ? await supabase
        .from('ofertas')
        .select('id, empresa, sede, ciudad, operacion, moneda, cantidad, precio_cop, condiciones, notas, expira_en, destacada')
        .eq('estado', 'activa')
        .gt('expira_en', new Date().toISOString())  // no mostrar vencidas aunque el cron aún no las haya marcado
        .neq('usuario_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [], error: null }
```

por:

```ts
  const { data: ofertas, error: errorOfertas } = puedeVerMercado
    ? await supabase
        .from('ofertas')
        .select('id, usuario_id, empresa, sede, ciudad, operacion, moneda, cantidad, precio_cop, condiciones, notas, expira_en, destacada')
        .eq('estado', 'activa')
        .gt('expira_en', new Date().toISOString())  // no mostrar vencidas aunque el cron aún no las haya marcado
        .neq('usuario_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [], error: null }

  const idsEmpresas = [...new Set((ofertas ?? []).map((o) => o.usuario_id))]
  const { data: reputaciones } = idsEmpresas.length
    ? await supabase.from('reputacion_usuarios').select('usuario_id, promedio, total').in('usuario_id', idsEmpresas)
    : { data: [] }
  const reputacionPorUsuario = new Map((reputaciones ?? []).map((r) => [r.usuario_id, { promedio: r.promedio, total: r.total }]))
```

- [ ] **Step 4: Pasar `reputacion` a cada tarjeta (sin exponer `usuario_id` al cliente)**

Reemplazar:

```ts
            ofertas={ofertas.map((o) => ({
              id: o.id,
              empresa: o.empresa,
              sede: o.sede,
              ciudad: o.ciudad,
              operacion: o.operacion,
              moneda: o.moneda,
              cantidad: o.cantidad,
              precioCop: o.precio_cop,
              condiciones: o.condiciones,
              notas: o.notas,
              expiraEn: o.expira_en,
              destacada: o.destacada,
            }))}
```

por:

```ts
            ofertas={ofertas.map((o) => ({
              id: o.id,
              empresa: o.empresa,
              sede: o.sede,
              ciudad: o.ciudad,
              operacion: o.operacion,
              moneda: o.moneda,
              cantidad: o.cantidad,
              precioCop: o.precio_cop,
              condiciones: o.condiciones,
              notas: o.notas,
              expiraEn: o.expira_en,
              destacada: o.destacada,
              reputacion: reputacionPorUsuario.get(o.usuario_id) ?? null,
            }))}
```

(`o.usuario_id` se usa solo en el servidor para el `Map` — nunca queda en el objeto que recibe `FiltroTablero`/`TarjetaOferta` en el cliente.)

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores. (`FiltroTablero` recibe `DatosOferta[]`; como `reputacion` es opcional, no hace falta tocar ese archivo.)

- [ ] **Step 6: Commit**

```bash
git add src/app/ofertas/tarjeta-oferta.tsx src/app/ofertas/page.tsx
git commit -m "feat(reputacion): estrellas de reputacion en el tablero de ofertas"
```

---

### Task REP6: Modal de calificar y banner en Mis ofertas / Mis intenciones

**Files:**
- Create: `src/app/ofertas/modal-calificar.tsx`
- Create: `src/app/ofertas/banner-por-calificar.tsx`
- Modify: `src/app/ofertas/mis-ofertas/page.tsx`
- Modify: `src/app/ofertas/mis-intenciones/page.tsx`

- [ ] **Step 1: Crear `src/app/ofertas/modal-calificar.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { Star } from 'lucide-react'
import { calificarContraparte } from './calificaciones-actions'
import type { AccionState } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function ModalCalificar({
  ofertaId,
  contraparte,
  resumen,
}: {
  ofertaId: string
  contraparte: string
  resumen: string
}) {
  const [open, setOpen] = useState(false)
  const [estrellas, setEstrellas] = useState(0)
  const [state, formAction, pending] = useActionState<AccionState, FormData>(
    async (prev, formData) => {
      const resultado = await calificarContraparte(prev, formData)
      if (!resultado.error) setOpen(false)
      return resultado
    },
    { error: null }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Calificar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calificar a {contraparte}</DialogTitle>
          <DialogDescription>{resumen}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="ofertaId" value={ofertaId} />
          <input type="hidden" name="estrellas" value={estrellas} />
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEstrellas(n)}
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                className="p-0.5"
              >
                <Star className={cn('size-7', n <= estrellas ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
              </button>
            ))}
          </div>
          <Textarea
            name="comentario"
            placeholder="Comentario opcional (solo lo ve el equipo de Tasa Directa, no la contraparte)"
            rows={3}
          />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending || estrellas === 0}>
            {pending ? 'Enviando…' : 'Enviar calificación'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Crear `src/app/ofertas/banner-por-calificar.tsx`**

```tsx
import { ModalCalificar } from './modal-calificar'
import type { TratoPorCalificar } from '@/lib/ofertas/tratos-por-calificar'

export function BannerPorCalificar({ tratos }: { tratos: TratoPorCalificar[] }) {
  if (!tratos.length) return null

  return (
    <div className="mb-6 grid gap-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        Tiene {tratos.length} trato{tratos.length > 1 ? 's' : ''} completado{tratos.length > 1 ? 's' : ''} por calificar
      </p>
      <div className="grid gap-2">
        {tratos.map((t) => (
          <div key={t.ofertaId} className="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm">
            <div>
              <p className="font-medium">{t.contraparte}</p>
              <p className="text-xs text-muted-foreground">{t.resumen}</p>
            </div>
            <ModalCalificar ofertaId={t.ofertaId} contraparte={t.contraparte} resumen={t.resumen} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Insertar el banner en Mis ofertas**

En `src/app/ofertas/mis-ofertas/page.tsx`, agregar el import junto a los demás:

```ts
import { BannerPorCalificar } from '../banner-por-calificar'
import { tratosPorCalificar } from '@/lib/ofertas/tratos-por-calificar'
```

Reemplazar:

```ts
  const [{ data: membresia }, { data: perfil }] = await Promise.all([
    supabase.from('membresias')
      .select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
    supabase.from('perfiles_usuarios').select('razon_social').eq('id', user.id).single(),
  ])
```

por:

```ts
  const [{ data: membresia }, { data: perfil }, tratosPendientes] = await Promise.all([
    supabase.from('membresias')
      .select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
    supabase.from('perfiles_usuarios').select('razon_social').eq('id', user.id).single(),
    tratosPorCalificar(user.id),
  ])
```

Y reemplazar:

```tsx
        {errorOfertas && (
```

por:

```tsx
        <BannerPorCalificar tratos={tratosPendientes} />

        {errorOfertas && (
```

- [ ] **Step 4: Insertar el banner en Mis intenciones**

En `src/app/ofertas/mis-intenciones/page.tsx`, agregar el import junto a los demás:

```ts
import { BannerPorCalificar } from '../banner-por-calificar'
import { tratosPorCalificar } from '@/lib/ofertas/tratos-por-calificar'
```

Reemplazar:

```ts
  const { data: intenciones } = await supabase
    .from('intenciones')
    .select('id, oferta_id, tipo, comentarios, estado, created_at')
    .eq('usuario_id', user.id)
    .order('created_at', { ascending: false })
```

por:

```ts
  const [{ data: intenciones }, tratosPendientes] = await Promise.all([
    supabase.from('intenciones')
      .select('id, oferta_id, tipo, comentarios, estado, created_at')
      .eq('usuario_id', user.id)
      .order('created_at', { ascending: false }),
    tratosPorCalificar(user.id),
  ])
```

Y reemplazar:

```tsx
        <section className="grid gap-4">
          {(intenciones ?? []).map((i) => {
```

por:

```tsx
        <BannerPorCalificar tratos={tratosPendientes} />

        <section className="grid gap-4">
          {(intenciones ?? []).map((i) => {
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/ofertas/modal-calificar.tsx src/app/ofertas/banner-por-calificar.tsx src/app/ofertas/mis-ofertas/page.tsx src/app/ofertas/mis-intenciones/page.tsx
git commit -m "feat(reputacion): modal de calificar y banner de tratos pendientes"
```

---

### Task REP7: Panel admin — acordeón de Reputación con eliminar

**Files:**
- Create: `src/app/admin/usuarios/[id]/reputacion.tsx`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/usuarios/[id]/page.tsx`

- [ ] **Step 1: Agregar `eliminarCalificacion` en `src/app/admin/actions.ts`**

Agregar al final del archivo:

```ts
export async function eliminarCalificacion(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const calificacionId = String(formData.get('calificacionId') ?? '')
  if (!calificacionId) return { error: 'Solicitud inválida.' }

  const { error } = await supabase.from('calificaciones').delete().eq('id', calificacionId)
  if (error) return { error: 'No se pudo eliminar la calificación.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}
```

(La política RLS `"calificaciones: admin elimina"` ya restringe el `delete` a `es_admin()` a nivel de base de datos — `exigirAdmin()` aquí es una segunda capa a nivel de aplicación, igual que el resto de acciones de este archivo.)

- [ ] **Step 2: Crear `src/app/admin/usuarios/[id]/reputacion.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { eliminarCalificacion } from '../../actions'
import type { AdminState } from '../../actions'

export interface CalificacionRecibida {
  id: string
  estrellas: number
  comentario: string | null
  calificadorNombre: string
  createdAt: string
}

function BotonEliminarCalificacion({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(eliminarCalificacion, { error: null })
  return (
    <form
      action={formAction}
      onSubmit={(e) => { if (!window.confirm('¿Eliminar esta calificación? No se puede deshacer.')) e.preventDefault() }}
    >
      <input type="hidden" name="calificacionId" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Eliminando…' : 'Eliminar'}
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  )
}

export function Reputacion({
  promedio,
  total,
  calificaciones,
}: {
  promedio: number | null
  total: number
  calificaciones: CalificacionRecibida[]
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          Reputación
          {promedio !== null ? (
            <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
              <Star className="size-4 fill-amber-400 text-amber-400" /> {promedio.toFixed(1)} ({total})
            </span>
          ) : (
            <span className="text-sm font-normal text-muted-foreground">Sin calificaciones aún</span>
          )}
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          {calificaciones.length === 0 && (
            <p className="text-sm text-muted-foreground">Este usuario aún no ha recibido calificaciones.</p>
          )}
          {calificaciones.map((c) => (
            <div key={c.id} className="grid gap-1 rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-medium">
                  <Star className="size-4 fill-amber-400 text-amber-400" /> {c.estrellas}/5 · {c.calificadorNombre}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('es-CO')}
                  </span>
                  <BotonEliminarCalificacion id={c.id} />
                </div>
              </div>
              {c.comentario && <p className="text-muted-foreground">&ldquo;{c.comentario}&rdquo;</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Traer los datos y montar `<Reputacion />` en el expediente**

En `src/app/admin/usuarios/[id]/page.tsx`, agregar el import junto a los demás:

```ts
import { Reputacion } from './reputacion'
```

Reemplazar el array del `Promise.all`:

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

por:

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: movimientos }, { data: aceptaciones }, { data: verificacionIdentidad }, { data: reputacion }, { data: calificacionesRecibidas }] = await Promise.all([
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
    supabase.from('reputacion_usuarios').select('promedio, total').eq('usuario_id', id).maybeSingle(),
    supabase.from('calificaciones')
      .select('id, estrellas, comentario, created_at, calificador_id')
      .eq('calificado_id', id)
      .order('created_at', { ascending: false }),
  ])
```

Después de calcular `listo` (antes de `const revisarBound = ...`), agregar:

```ts
  const idsCalificadores = [...new Set((calificacionesRecibidas ?? []).map((c) => c.calificador_id))]
  const { data: calificadores } = idsCalificadores.length
    ? await supabase.from('perfiles_usuarios').select('id, razon_social').in('id', idsCalificadores)
    : { data: [] }
  const nombrePorCalificador = new Map((calificadores ?? []).map((p) => [p.id, p.razon_social ?? 'PCD']))
```

Y, justo antes del cierre del `perfil.estado === 'aprobado' && (<GestionComercial .../>)`, insertar la sección nueva:

```tsx
      {perfil.estado === 'aprobado' && (
        <Reputacion
          promedio={reputacion?.promedio ?? null}
          total={reputacion?.total ?? 0}
          calificaciones={(calificacionesRecibidas ?? []).map((c) => ({
            id: c.id,
            estrellas: c.estrellas,
            comentario: c.comentario,
            calificadorNombre: nombrePorCalificador.get(c.calificador_id) ?? 'PCD',
            createdAt: c.created_at,
          }))}
        />
      )}

      {perfil.estado === 'aprobado' && (
        <GestionComercial
```

(Y cerrar el JSX exactamente igual que antes — solo se agrega el bloque nuevo antes del que ya existía, sin tocar el resto.)

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/usuarios/[id]/reputacion.tsx src/app/admin/actions.ts src/app/admin/usuarios/[id]/page.tsx
git commit -m "feat(reputacion): acordeon de reputacion en el expediente admin, con eliminar"
```

---

### Task REP8: Verificación final, documentación y deploy

**Files:** ninguno nuevo — solo verificación y coordinación de despliegue.

- [ ] **Step 1: Correr toda la suite**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores de tipos, todos los tests en verde (incluye los 8 nuevos de `calificacion.test.ts`).

- [ ] **Step 2: Avisar a Jaime cuál migración correr — NO fusionar todavía**

Commitear y pushear todo a `fase-2-kyc` (no a `master`). Decirle explícitamente a Jaime: "corre `supabase/migrations/0016_reputacion.sql` en el SQL Editor de Supabase" y esperar su confirmación antes de continuar — igual que se hizo con la migration 0015. Si se fusiona a `master` antes de correrla, **cerrar cualquier trato en producción se rompe por completo** (columna `interlocutor_id` inexistente).

- [ ] **Step 3: Verificación manual en navegador (después de que Jaime confirme la migración)**

Con `preview_start({name:'dev'})` y dos sesiones de prueba (magic link, service-role para simular datos si hace falta):

1. Completar un trato de prueba vía `completar_oferta` (negociación → "Marcar como completada") y confirmar con una consulta de servicio que `ofertas.interlocutor_id` quedó con el id correcto.
2. Completar otro trato vía `aceptar_intencion` (aceptar una intención desde Mis Ofertas) y confirmar lo mismo.
3. Desde ambos lados del trato, calificar al otro (estrellas + comentario) y confirmar que el promedio aparece en la tarjeta del tablero para la empresa calificada.
4. Confirmar que el comentario NO aparece en ningún lado visible para el otro PCD (tablero, detalle de intención), pero SÍ aparece completo en `/admin/usuarios/[id]` al desplegar el acordeón de Reputación.
5. Intentar calificar el mismo trato dos veces desde el mismo usuario → debe fallar con "Ya calificó este trato."
6. Eliminar una calificación desde el panel admin y confirmar que el promedio público se recalcula (o desaparece si era la única).
7. Confirmar que publicar, responder, aceptar, completar y "cerrar sin acuerdo" siguen funcionando exactamente igual que antes (sin cambios de comportamiento visibles para el usuario).
8. Limpiar cualquier dato de prueba insertado para esta verificación.

- [ ] **Step 4: Merge a `master` y deploy**

Solo después de que el Step 3 pase completo:

```bash
git checkout master
git merge fase-2-kyc --no-edit
git push origin master
git checkout fase-2-kyc
git push origin fase-2-kyc
```

Vercel despliega `master` automáticamente a producción.
