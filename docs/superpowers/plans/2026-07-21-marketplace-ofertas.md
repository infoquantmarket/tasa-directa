# Marketplace de Ofertas (Fase 3 + 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el marketplace real de Tasa Directa: publicar/ver ofertas de compra-venta de divisas, responder con intenciones (revelando contacto), un ciclo de negociación (completar/republicar/liberar), y visibilidad de admin — sobre el backend de RLS/triggers que ya existe desde Fase 1 y 2.5.

**Architecture:** La mayor parte del backend (RLS, triggers de acceso, la vista `perfiles_publicos`, el modelo de tokens) ya existe. Este plan agrega: 2 columnas a `ofertas`, nuevos estados (`en_negociacion`/`completada`), un tope de 2 ofertas activas gratis + hasta 3 más pagando 1 token cada una, dos funciones RPC nuevas para el ciclo de negociación, un trigger que borra ofertas al cancelar membresía, y toda la capa de UI (páginas, componentes, Server Actions) + notificación por correo (Resend) que nunca se construyó.

**Tech Stack:** Next.js 16 App Router (Server Actions + Route pages), TypeScript, Supabase (Postgres + RLS + funciones `security definer`), zod + Vitest (TDD), Resend (API HTTP directa, primera vez que el código llama a Resend fuera de Supabase Auth).

**Spec:** [`docs/superpowers/specs/2026-07-21-marketplace-ofertas-design.md`](../specs/2026-07-21-marketplace-ofertas-design.md)

---

## Contexto imprescindible para el ejecutor (sin memoria del proyecto)

- **La mayoría del backend YA EXISTE.** No recrear desde cero: `ofertas`/`intenciones` (tablas, RLS, triggers `verificar_acceso_oferta()`/`verificar_acceso_intencion()`/`proteger_campos_oferta()`), `tiene_membresia_activa()`, `es_aprobado()`, la vista `perfiles_publicos` (Task MK1 la amplía con el contacto operativo, ver abajo), y `consumir_tokens()`/`otorgar_tokens()` — todo en `supabase/migrations/0001_esquema_inicial.sql` y `0003_modelo_comercial.sql`. Este plan solo **amplía** (`create or replace`) esas funciones/vista, nunca las reescribe desde cero.
- **`RESEND_API_KEY` YA CARGADA** en `.env.local` y en Vercel (Production/Preview/Development) — no hay que pedirla ni crearla. El dominio `tasadirecta.com` está verificado en esa cuenta de Resend.
- **Aplicación de migraciones:** Jaime corre el SQL manualmente en el SQL Editor de Supabase — no hay CLI local de Supabase en este entorno. Cada task de migración debe dejar el archivo listo, no ejecutarlo.
- **Patrón de "sin formulario real"** para botones de acción simple (completar/republicar/eliminar): `<form action={accionBound}><input type="hidden" .../></form>`, ver `src/app/admin/usuarios/[id]/page.tsx`.
- **Patrón de notificación best-effort:** ver `src/lib/telegram/notificar.ts` — nunca lanzar una excepción que rompa el flujo del usuario si falla el envío; solo `console.error`/`console.warn`.
- **`Dialog` de shadcn/ui (Base UI)** ya está instalado en `src/components/ui/dialog.tsx` pero nunca se ha usado en el proyecto — este plan es el primer consumidor real.
- Verificación estándar del proyecto: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`.

## File Structure

- **Create** `supabase/migrations/0007_marketplace_ofertas.sql` — columnas nuevas, estados nuevos, tope 2+tokens, ciclo de negociación, borrado por cancelación, cron por hora.
- **Modify** `src/types/database.ts` — `EstadoOferta`, `TokenConcepto`, `ofertas.Row` (+ `notas`/`expira_en`, − `fecha_oferta`), nuevas `Functions`.
- **Create** `src/lib/validation/oferta.ts` — `ofertaSchema`, catálogos de moneda/condiciones.
- **Test** `tests/validation/oferta.test.ts`.
- **Create** `src/lib/validation/intencion.ts` — `intencionSchema`.
- **Test** `tests/validation/intencion.test.ts`.
- **Create** `src/lib/ofertas/tiempo.ts` — `formatearCuentaRegresiva(expiraEn)`.
- **Test** `tests/ofertas/tiempo.test.ts`.
- **Create** `src/lib/resend/cliente.ts` — `enviarCorreo({ to, subject, html })`.
- **Test** `tests/resend/cliente.test.ts`.
- **Create** `src/lib/notificaciones/intencion.ts` — `notificarNuevaIntencion(...)`.
- **Test** `tests/notificaciones/intencion.test.ts`.
- **Create** `src/app/ofertas/actions.ts` — todas las Server Actions del marketplace.
- **Create** `src/app/ofertas/tarjeta-oferta.tsx` — tarjeta compartida (tablero + mis-ofertas).
- **Create** `src/app/ofertas/modal-realizar-oferta.tsx`.
- **Create** `src/app/ofertas/page.tsx` — tablero.
- **Create** `src/app/ofertas/mis-ofertas/page.tsx`.
- **Create** `src/app/ofertas/mis-ofertas/modal-publicar-oferta.tsx`.
- **Create** `src/app/ofertas/mis-intenciones/page.tsx`.
- **Modify** `src/components/site-header.tsx` — enlace a "Ofertas".
- **Create** `src/app/admin/operaciones/page.tsx` — panel admin de operaciones.
- **Modify** `src/app/admin/page.tsx` — enlace a "Operaciones".

---

### Task MK1: Migration 0007 — columnas, estados, tope 2+tokens, negociación, cancelación

**Files:**
- Create: `supabase/migrations/0007_marketplace_ofertas.sql`

- [ ] **Step 1: Escribir la migration completa**

```sql
-- =============================================================================
-- TASA DIRECTA · Fase 3+4 · Marketplace de ofertas
-- Ajusta el backend ya existente (Fase 1 + 2.5) a las reglas confirmadas:
-- expiración por oferta (24h), tope 2 gratis + hasta 3 con tokens (máx. 5),
-- ciclo de negociación, borrado de ofertas al cancelar membresía.
-- Idempotente.
-- =============================================================================

-- 0. perfiles_publicos: agregar el contacto operativo (no el representante
--    legal) — es lo que necesita el modal "Realizar Oferta" para mostrar a
--    quién llamar, y la vista original solo tenía datos de la empresa.
create or replace view public.perfiles_publicos as
select id, razon_social, nombre_comercial, sede, ciudad, telefono, whatsapp,
       correo, contacto_nombre, contacto_celular, contacto_correo
from public.perfiles_usuarios
where estado = 'aprobado';

-- 1. Columnas nuevas en ofertas --------------------------------------------------
alter table public.ofertas
  add column if not exists notas text,
  add column if not exists expira_en timestamptz;

update public.ofertas set expira_en = created_at + interval '24 hours'
  where expira_en is null;

alter table public.ofertas
  alter column expira_en set not null,
  alter column expira_en set default (now() + interval '24 hours');

alter table public.ofertas drop column if exists fecha_oferta;

-- 2. Nuevos estados de oferta -----------------------------------------------------
alter table public.ofertas drop constraint if exists ofertas_estado_check;
alter table public.ofertas
  add constraint ofertas_estado_check
  check (estado in ('activa','en_negociacion','completada','expirada','eliminada'));

-- 3. Nuevo concepto de token: oferta_adicional ------------------------------------
alter table public.token_movimientos drop constraint if exists token_movimientos_concepto_check;
alter table public.token_movimientos
  add constraint token_movimientos_concepto_check
  check (concepto in
    ('compra','ajuste_admin','destacar_oferta','alerta_premium',
     'oferta_urgente','republicacion','reembolso','oferta_adicional'));

-- consumir_tokens() valida el concepto también dentro de la función (no solo
-- el CHECK de la tabla) — hay que ampliar esa lista también.
create or replace function public.consumir_tokens(
  p_cantidad integer, p_concepto text, p_referencia uuid default null,
  p_nota text default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_saldo integer;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser un entero positivo.'
      using errcode = 'check_violation';
  end if;
  if p_concepto not in ('destacar_oferta','alerta_premium','oferta_urgente','republicacion','oferta_adicional') then
    raise exception 'Concepto inválido para consumir tokens.'
      using errcode = 'check_violation';
  end if;

  insert into public.token_saldos (usuario_id, saldo) values (v_uid, 0)
  on conflict (usuario_id) do nothing;

  select saldo into v_saldo from public.token_saldos
  where usuario_id = v_uid for update;

  if v_saldo < p_cantidad then
    raise exception 'Saldo insuficiente: tiene % tokens y el servicio requiere %.',
      v_saldo, p_cantidad using errcode = 'check_violation';
  end if;

  update public.token_saldos set saldo = saldo - p_cantidad
  where usuario_id = v_uid
  returning saldo into v_saldo;

  insert into public.token_movimientos
    (usuario_id, delta, concepto, referencia, nota, creado_por)
  values (v_uid, -p_cantidad, p_concepto, p_referencia, p_nota, v_uid);

  return v_saldo;
end;
$$;

-- 4. proteger_campos_oferta: ya no fecha_oferta, sí notas -------------------------
create or replace function public.proteger_campos_oferta()
returns trigger
language plpgsql
as $$
begin
  if new.moneda       is distinct from old.moneda
  or new.empresa      is distinct from old.empresa
  or new.sede         is distinct from old.sede
  or new.operacion    is distinct from old.operacion
  or new.condiciones  is distinct from old.condiciones
  or new.usuario_id   is distinct from old.usuario_id
  or new.notas        is distinct from old.notas
  or new.created_at   is distinct from old.created_at then
    raise exception 'Solo se pueden editar cantidad y precio. La moneda y el resto de campos son inmutables.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
-- El trigger trg_proteger_oferta ya existe y apunta a esta función; el
-- `create or replace` de arriba basta, no hace falta recrear el trigger.

-- 5. verificar_acceso_oferta: tope 2 gratis + hasta 5 con tokens ------------------
create or replace function public.verificar_acceso_oferta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_activas integer;
begin
  if not public.es_aprobado(new.usuario_id) then
    raise exception 'El usuario no está aprobado para publicar ofertas.'
      using errcode = 'check_violation';
  end if;
  if not public.tiene_membresia_activa(new.usuario_id) then
    raise exception 'Se requiere una membresía activa para publicar ofertas.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_activas
  from public.ofertas
  where usuario_id = new.usuario_id
    and estado in ('activa','en_negociacion');

  if v_activas >= 5 then
    raise exception 'Ya tiene 5 ofertas activas. Espere a que una expire, se complete o elimine una para publicar otra.'
      using errcode = 'check_violation';
  elsif v_activas >= 2 then
    perform public.consumir_tokens(1, 'oferta_adicional', new.id);
  end if;

  return new;
end;
$$;
-- El trigger trg_acceso_oferta ya existe y apunta a esta función.

-- 6. Ciclo de negociación ----------------------------------------------------------
create or replace function public.iniciar_negociacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.ofertas set estado = 'en_negociacion', updated_at = now()
  where id = new.oferta_id;
  return new;
end;
$$;

drop trigger if exists trg_iniciar_negociacion on public.intenciones;
create trigger trg_iniciar_negociacion
  after insert on public.intenciones
  for each row execute function public.iniciar_negociacion();

create or replace function public.completar_oferta(p_oferta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dueno  uuid;
  v_estado text;
begin
  select usuario_id, estado into v_dueno, v_estado
  from public.ofertas where id = p_oferta_id;

  if v_estado is distinct from 'en_negociacion' then
    raise exception 'Esta oferta no está en negociación.'
      using errcode = 'check_violation';
  end if;
  if v_dueno <> auth.uid() then
    raise exception 'Solo el dueño de la oferta puede completarla.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.ofertas set estado = 'completada', updated_at = now()
  where id = p_oferta_id;

  update public.intenciones set estado = 'cerrada', updated_at = now()
  where oferta_id = p_oferta_id and estado in ('enviada','vista');
end;
$$;

create or replace function public.cerrar_negociacion_sin_acuerdo(p_oferta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dueno        uuid;
  v_estado       text;
  v_puede_cerrar boolean;
begin
  select usuario_id, estado into v_dueno, v_estado
  from public.ofertas where id = p_oferta_id;

  if v_estado is distinct from 'en_negociacion' then
    raise exception 'Esta oferta no está en negociación.'
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.intenciones
    where oferta_id = p_oferta_id
      and estado in ('enviada','vista')
      and usuario_id = auth.uid()
  ) into v_puede_cerrar;

  if v_dueno <> auth.uid() and not v_puede_cerrar then
    raise exception 'Solo el dueño de la oferta o quien respondió pueden cerrar la negociación.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.ofertas
    set estado = 'activa', expira_en = now() + interval '24 hours', updated_at = now()
  where id = p_oferta_id;

  update public.intenciones set estado = 'cerrada', updated_at = now()
  where oferta_id = p_oferta_id and estado in ('enviada','vista');
end;
$$;

-- 7. Membresía cancelada → elimina ofertas activas/en negociación -----------------
create or replace function public.liberar_ofertas_por_cancelacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'activa' and new.estado is distinct from 'activa' then
    update public.ofertas
      set estado = 'eliminada', updated_at = now()
    where usuario_id = new.usuario_id
      and estado in ('activa','en_negociacion');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_liberar_ofertas_cancelacion on public.membresias;
create trigger trg_liberar_ofertas_cancelacion
  after update on public.membresias
  for each row execute function public.liberar_ofertas_por_cancelacion();

-- 8. Cron: expiración por oferta (24h) en vez de medianoche global ----------------
do $$
begin
  perform cron.unschedule('expirar-ofertas-medianoche');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('expirar-ofertas-por-hora');
exception when others then null;
end $$;

select cron.schedule(
  'expirar-ofertas-por-hora',
  '0 * * * *',
  $cron$
    update public.ofertas
       set estado = 'expirada', updated_at = now()
     where estado = 'activa' and expira_en <= now();
  $cron$
);
```

- [ ] **Step 2: Verificar que el archivo quedó bien escrito**

Run: `cat supabase/migrations/0007_marketplace_ofertas.sql`
Expected: el contenido de arriba. (La aplicación real la corre Jaime en el SQL Editor de Supabase.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_marketplace_ofertas.sql
git commit -m "feat(db): migration 0007 — marketplace de ofertas (tope 2+tokens, negociación, cancelación)"
```

---

### Task MK2: Tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Ampliar `EstadoOferta` y `TokenConcepto`**

Reemplazar:

```ts
export type TokenConcepto = 'compra' | 'ajuste_admin' | 'destacar_oferta' | 'alerta_premium' | 'oferta_urgente' | 'republicacion' | 'reembolso'
```

por:

```ts
export type TokenConcepto = 'compra' | 'ajuste_admin' | 'destacar_oferta' | 'alerta_premium' | 'oferta_urgente' | 'republicacion' | 'reembolso' | 'oferta_adicional'
```

Reemplazar:

```ts
export type EstadoOferta = 'activa' | 'expirada' | 'eliminada'
```

por:

```ts
export type EstadoOferta = 'activa' | 'en_negociacion' | 'completada' | 'expirada' | 'eliminada'
```

- [ ] **Step 2: Ajustar la entrada de tabla `ofertas`**

Reemplazar:

```ts
      ofertas: {
        Row: {
          id:           string
          usuario_id:   string
          empresa:      string
          sede:         string | null
          operacion:    Operacion | null
          moneda:       Moneda
          cantidad:     number
          precio_cop:   number
          condiciones:  Condicion[]
          estado:       EstadoOferta
          fecha_oferta: string
          created_at:   string
          updated_at:   string
        }
        Insert: Omit<Database['public']['Tables']['ofertas']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Pick<Database['public']['Tables']['ofertas']['Row'], 'cantidad' | 'precio_cop' | 'estado'>>
        Relationships: []
      }
```

por:

```ts
      ofertas: {
        Row: {
          id:         string
          usuario_id: string
          empresa:    string
          sede:       string | null
          operacion:  Operacion | null
          moneda:     Moneda
          cantidad:   number
          precio_cop: number
          condiciones: Condicion[]
          estado:     EstadoOferta
          notas:      string | null
          expira_en:  string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['ofertas']['Row'], 'id' | 'expira_en' | 'created_at' | 'updated_at'> & { expira_en?: string }
        Update: Partial<Pick<Database['public']['Tables']['ofertas']['Row'], 'cantidad' | 'precio_cop' | 'estado'>>
        Relationships: []
      }
```

(`expira_en` queda opcional en `Insert` porque la migration le puso `default (now() + interval '24 hours')` — el cliente normalmente no lo manda.)

- [ ] **Step 3: Ampliar la vista `perfiles_publicos` con el contacto operativo**

Reemplazar:

```ts
      perfiles_publicos: {
        Row: {
          id:               string
          razon_social:     string
          nombre_comercial: string | null
          sede:             string | null
          ciudad:           string | null
          telefono:         string | null
          whatsapp:         string | null
          correo:           string
        }
        Relationships: []
      }
```

por:

```ts
      perfiles_publicos: {
        Row: {
          id:               string
          razon_social:     string
          nombre_comercial: string | null
          sede:             string | null
          ciudad:           string | null
          telefono:         string | null
          whatsapp:         string | null
          correo:           string
          contacto_nombre:  string
          contacto_celular: string
          contacto_correo:  string
        }
        Relationships: []
      }
```

- [ ] **Step 4: Agregar las 2 funciones nuevas**

Reemplazar:

```ts
      consumir_tokens: {
        Args: { p_cantidad: number; p_concepto: string; p_referencia?: string; p_nota?: string }
        Returns: number
      }
    }
  }
```

por:

```ts
      consumir_tokens: {
        Args: { p_cantidad: number; p_concepto: string; p_referencia?: string; p_nota?: string }
        Returns: number
      }
      completar_oferta: { Args: { p_oferta_id: string }; Returns: void }
      cerrar_negociacion_sin_acuerdo: { Args: { p_oferta_id: string }; Returns: void }
    }
  }
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(ofertas): tipos de EstadoOferta, TokenConcepto, perfiles_publicos y funciones del marketplace"
```

---

### Task MK3: Validación de oferta (TDD)

**Files:**
- Create: `src/lib/validation/oferta.ts`
- Test: `tests/validation/oferta.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/validation/oferta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ofertaSchema, MONEDAS, CONDICIONES } from '@/lib/validation/oferta'

const base = {
  operacion: 'compra' as const,
  moneda: 'USD' as const,
  cantidad: '1000',
  precioCop: '4200',
  condiciones: ['efectivo'] as const,
  sede: 'Oviedo',
  notas: '',
}

describe('constantes', () => {
  it('MONEDAS tiene las 8 monedas del esquema original', () => {
    expect(MONEDAS).toEqual(['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'CHF', 'AUD', 'JPY'])
  })
  it('CONDICIONES tiene las 4 condiciones del esquema original', () => {
    expect(CONDICIONES).toEqual(['efectivo', 'transferencia', 'para_recoger', 'en_oficina'])
  })
})

describe('ofertaSchema', () => {
  it('acepta una oferta válida completa', () => {
    expect(ofertaSchema.safeParse(base).success).toBe(true)
  })
  it('acepta notas y sede vacías (opcionales)', () => {
    expect(ofertaSchema.safeParse({ ...base, notas: '', sede: '' }).success).toBe(true)
  })
  it('rechaza operación inválida', () => {
    expect(ofertaSchema.safeParse({ ...base, operacion: 'venta_al_por_mayor' }).success).toBe(false)
  })
  it('rechaza moneda no soportada', () => {
    expect(ofertaSchema.safeParse({ ...base, moneda: 'BTC' }).success).toBe(false)
  })
  it('rechaza cantidad no positiva', () => {
    expect(ofertaSchema.safeParse({ ...base, cantidad: '0' }).success).toBe(false)
    expect(ofertaSchema.safeParse({ ...base, cantidad: '-5' }).success).toBe(false)
  })
  it('rechaza precio no positivo', () => {
    expect(ofertaSchema.safeParse({ ...base, precioCop: '0' }).success).toBe(false)
  })
  it('rechaza cantidad no numérica', () => {
    expect(ofertaSchema.safeParse({ ...base, cantidad: 'mil' }).success).toBe(false)
  })
  it('rechaza sin ninguna condición marcada', () => {
    expect(ofertaSchema.safeParse({ ...base, condiciones: [] }).success).toBe(false)
  })
  it('rechaza una condición no reconocida', () => {
    expect(ofertaSchema.safeParse({ ...base, condiciones: ['bitcoin'] }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/validation/oferta.test.ts`
Expected: FAIL — módulo `@/lib/validation/oferta` no encontrado.

- [ ] **Step 3: Crear `src/lib/validation/oferta.ts`**

```ts
import { z } from 'zod'

export const MONEDAS = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'CHF', 'AUD', 'JPY'] as const
export const CONDICIONES = ['efectivo', 'transferencia', 'para_recoger', 'en_oficina'] as const

const numeroPositivo = z.string().refine(
  (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0
  },
  { message: 'Debe ser un número mayor que cero' }
)

export const ofertaSchema = z.object({
  operacion: z.enum(['compra', 'venta']),
  moneda: z.enum(MONEDAS),
  cantidad: numeroPositivo,
  precioCop: numeroPositivo,
  condiciones: z.array(z.enum(CONDICIONES)).min(1, 'Seleccione al menos una condición'),
  sede: z.string().optional(),
  notas: z.string().optional(),
})

export type OfertaInput = z.infer<typeof ofertaSchema>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/validation/oferta.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/oferta.ts tests/validation/oferta.test.ts
git commit -m "feat(ofertas): validación zod de publicar oferta (TDD)"
```

---

### Task MK4: Validación de intención (TDD)

**Files:**
- Create: `src/lib/validation/intencion.ts`
- Test: `tests/validation/intencion.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/validation/intencion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { intencionSchema } from '@/lib/validation/intencion'

describe('intencionSchema', () => {
  it('acepta tipo aceptar_precio sin comentarios', () => {
    expect(intencionSchema.safeParse({ tipo: 'aceptar_precio', comentarios: '' }).success).toBe(true)
  })
  it('acepta tipo solicitar_contacto con comentarios', () => {
    expect(intencionSchema.safeParse({
      tipo: 'solicitar_contacto', comentarios: 'Podemos hacerlo mañana en la mañana',
    }).success).toBe(true)
  })
  it('rechaza un tipo no reconocido', () => {
    expect(intencionSchema.safeParse({ tipo: 'regatear', comentarios: '' }).success).toBe(false)
  })
  it('rechaza sin tipo', () => {
    expect(intencionSchema.safeParse({ comentarios: 'hola' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/validation/intencion.test.ts`
Expected: FAIL — módulo `@/lib/validation/intencion` no encontrado.

- [ ] **Step 3: Crear `src/lib/validation/intencion.ts`**

```ts
import { z } from 'zod'

export const intencionSchema = z.object({
  tipo: z.enum(['aceptar_precio', 'solicitar_contacto']),
  comentarios: z.string().optional(),
})

export type IntencionInput = z.infer<typeof intencionSchema>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/validation/intencion.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/intencion.ts tests/validation/intencion.test.ts
git commit -m "feat(ofertas): validación zod de Realizar Oferta (TDD)"
```

---

### Task MK5: Formato de cuenta regresiva (TDD)

**Files:**
- Create: `src/lib/ofertas/tiempo.ts`
- Test: `tests/ofertas/tiempo.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/ofertas/tiempo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'

describe('formatearCuentaRegresiva', () => {
  it('muestra horas y minutos cuando faltan más de 1 hora', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = new Date('2026-07-21T18:30:00Z').toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Vence en 6h 30min')
  })
  it('muestra solo minutos cuando falta menos de 1 hora', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = new Date('2026-07-21T12:45:00Z').toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Vence en 45min')
  })
  it('dice "Expirada" si expira_en ya pasó', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = new Date('2026-07-21T11:00:00Z').toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Expirada')
  })
  it('dice "Expirada" justo en el límite (0 minutos restantes)', () => {
    const ahora = new Date('2026-07-21T12:00:00Z')
    const expiraEn = ahora.toISOString()
    expect(formatearCuentaRegresiva(expiraEn, ahora)).toBe('Expirada')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/ofertas/tiempo.test.ts`
Expected: FAIL — módulo `@/lib/ofertas/tiempo` no encontrado.

- [ ] **Step 3: Crear `src/lib/ofertas/tiempo.ts`**

```ts
/**
 * "Vence en Xh Ymin" / "Vence en Ymin" / "Expirada" — para el stamp de
 * cuenta regresiva en las tarjetas de oferta. `ahora` es inyectable para
 * poder testear determinísticamente; en producción se omite (usa Date.now()).
 */
export function formatearCuentaRegresiva(expiraEn: string, ahora: Date = new Date()): string {
  const msRestantes = new Date(expiraEn).getTime() - ahora.getTime()
  if (msRestantes <= 0) return 'Expirada'

  const minutosTotales = Math.floor(msRestantes / 60_000)
  const horas = Math.floor(minutosTotales / 60)
  const minutos = minutosTotales % 60

  if (horas > 0) return `Vence en ${horas}h ${minutos}min`
  return `Vence en ${minutos}min`
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/ofertas/tiempo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ofertas/tiempo.ts tests/ofertas/tiempo.test.ts
git commit -m "feat(ofertas): formatear cuenta regresiva de expiración (TDD)"
```

---

### Task MK6: Cliente Resend (TDD)

**Files:**
- Create: `src/lib/resend/cliente.ts`
- Test: `tests/resend/cliente.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/resend/cliente.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { enviarCorreo } from '@/lib/resend/cliente'

describe('enviarCorreo', () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...original }
  })

  it('llama a la API de Resend con la URL, headers y body correctos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'abc' }) })
    vi.stubGlobal('fetch', fetchMock)

    await enviarCorreo({ to: 'jaime@nutifinanzas.com', subject: 'Nueva intención', html: '<p>hola</p>' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    )
    const cuerpo = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(cuerpo).toEqual({
      from: 'Tasa Directa <noreply@tasadirecta.com>',
      to: ['jaime@nutifinanzas.com'],
      subject: 'Nueva intención',
      html: '<p>hola</p>',
    })
  })

  it('no lanza si la respuesta no es exitosa (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve('bad request') }))
    await expect(
      enviarCorreo({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    ).resolves.toBeUndefined()
  })

  it('no lanza si fetch rechaza (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(
      enviarCorreo({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    ).resolves.toBeUndefined()
  })

  it('no llama a fetch si falta RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await enviarCorreo({ to: 'x@y.com', subject: 's', html: '<p>h</p>' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/resend/cliente.test.ts`
Expected: FAIL — módulo `@/lib/resend/cliente` no encontrado.

- [ ] **Step 3: Crear `src/lib/resend/cliente.ts`**

```ts
const RESEND_URL = 'https://api.resend.com/emails'
const REMITENTE = 'Tasa Directa <noreply@tasadirecta.com>'

export interface EnviarCorreoInput {
  to: string
  subject: string
  html: string
}

/**
 * Envía un correo transaccional vía la API de Resend. Es "best-effort" a
 * propósito (nunca lanza): un fallo al notificar por correo no debe romper
 * el flujo del usuario (ej. crear una intención), igual que
 * src/lib/telegram/notificar.ts.
 */
export async function enviarCorreo(input: EnviarCorreoInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY no configurado; se omite envío.')
    return
  }

  try {
    const respuesta = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    })
    if (!respuesta.ok) {
      console.error('[resend] Error al enviar correo:', await respuesta.text())
    }
  } catch (err) {
    console.error('[resend] Excepción al enviar correo:', err)
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/resend/cliente.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resend/cliente.ts tests/resend/cliente.test.ts
git commit -m "feat(resend): cliente para enviar correos transaccionales (TDD)"
```

---

### Task MK7: Notificación de nueva intención (TDD)

**Files:**
- Create: `src/lib/notificaciones/intencion.ts`
- Test: `tests/notificaciones/intencion.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/notificaciones/intencion.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as resendCliente from '@/lib/resend/cliente'
import { notificarNuevaIntencion } from '@/lib/notificaciones/intencion'

describe('notificarNuevaIntencion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envía el correo al dueño de la oferta con los datos de contacto', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarNuevaIntencion({
      correoDueno: 'dueno@empresa.com',
      empresaRespondio: 'Nutifinanzas S.A.S',
      contactoRespondio: 'Jaime Calle',
      celularRespondio: '3113472345',
      correoRespondio: 'jaime@nutifinanzas.com',
      tipo: 'aceptar_precio',
      comentarios: 'Podemos hacerlo hoy mismo',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dueno@empresa.com',
        subject: expect.stringContaining('Nueva intención'),
      })
    )
    const html = spy.mock.calls[0][0].html
    expect(html).toContain('Nutifinanzas S.A.S')
    expect(html).toContain('Jaime Calle')
    expect(html).toContain('3113472345')
    expect(html).toContain('jaime@nutifinanzas.com')
    expect(html).toContain('Podemos hacerlo hoy mismo')
  })

  it('no revienta si enviarCorreo falla (best-effort, ya lo maneja el cliente)', async () => {
    vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)
    await expect(notificarNuevaIntencion({
      correoDueno: 'x@y.com', empresaRespondio: 'X', contactoRespondio: 'Y',
      celularRespondio: '300', correoRespondio: 'y@z.com',
      tipo: 'solicitar_contacto', comentarios: null,
    })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/notificaciones/intencion.test.ts`
Expected: FAIL — módulo `@/lib/notificaciones/intencion` no encontrado.

- [ ] **Step 3: Crear `src/lib/notificaciones/intencion.ts`**

```ts
import { enviarCorreo } from '@/lib/resend/cliente'
import type { TipoIntencion } from '@/types/database'

export interface NotificarNuevaIntencionInput {
  correoDueno: string
  empresaRespondio: string
  contactoRespondio: string
  celularRespondio: string
  correoRespondio: string
  tipo: TipoIntencion
  comentarios: string | null
}

const ETIQUETA_TIPO: Record<TipoIntencion, string> = {
  aceptar_precio: 'Acepta el precio publicado',
  solicitar_contacto: 'Solicita contacto para negociar',
}

export async function notificarNuevaIntencion(input: NotificarNuevaIntencionInput): Promise<void> {
  const html = `
    <h2>Nueva intención sobre su oferta</h2>
    <p><strong>${input.empresaRespondio}</strong> respondió a su publicación en Tasa Directa.</p>
    <p><strong>Tipo:</strong> ${ETIQUETA_TIPO[input.tipo]}</p>
    ${input.comentarios ? `<p><strong>Comentarios:</strong> ${input.comentarios}</p>` : ''}
    <h3>Datos de contacto</h3>
    <p>${input.contactoRespondio}<br/>
    Celular: ${input.celularRespondio}<br/>
    Correo: ${input.correoRespondio}</p>
    <p>Entre a Tasa Directa para ver el detalle y decidir si continúa la negociación.</p>
  `

  await enviarCorreo({
    to: input.correoDueno,
    subject: 'Nueva intención sobre su oferta — Tasa Directa',
    html,
  })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/notificaciones/intencion.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones/intencion.ts tests/notificaciones/intencion.test.ts
git commit -m "feat(ofertas): notificación por correo de nueva intención (TDD)"
```

---

### Task MK8: Server Actions del marketplace

**Files:**
- Create: `src/app/ofertas/actions.ts`

- [ ] **Step 1: Crear el archivo completo**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ofertaSchema } from '@/lib/validation/oferta'
import { intencionSchema } from '@/lib/validation/intencion'
import { notificarNuevaIntencion } from '@/lib/notificaciones/intencion'

export type AccionState = { error: string | null }

/**
 * Traduce los `raise exception` de Postgres (triggers/funciones) a mensajes
 * que tienen sentido para el PCD. Los triggers ya escriben mensajes en
 * español pensados para mostrarse tal cual; solo se agrega contexto cuando
 * el mensaje de Postgres no alcanza a explicar el porqué.
 */
function mensajeDesdeError(error: { message: string } | null): string {
  if (!error) return 'Ocurrió un error inesperado. Intente de nuevo.'
  if (error.message.includes('Saldo insuficiente')) {
    return 'Ya tiene 2 ofertas activas gratis. Publicar una adicional requiere tokens y no tiene saldo suficiente.'
  }
  return error.message
}

export async function publicarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const parsed = ofertaSchema.safeParse({
    operacion: formData.get('operacion'),
    moneda: formData.get('moneda'),
    cantidad: formData.get('cantidad'),
    precioCop: formData.get('precioCop'),
    condiciones: formData.getAll('condiciones'),
    sede: formData.get('sede'),
    notas: formData.get('notas'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('razon_social')
    .eq('id', user.id)
    .single()

  const d = parsed.data
  const { error } = await supabase.from('ofertas').insert({
    usuario_id: user.id,
    empresa: perfil?.razon_social ?? '',
    sede: d.sede || null,
    operacion: d.operacion,
    moneda: d.moneda,
    cantidad: Number(d.cantidad),
    precio_cop: Number(d.precioCop),
    condiciones: d.condiciones,
    estado: 'activa',
    notas: d.notas || null,
  })

  if (error) return { error: mensajeDesdeError(error) }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  return { error: null }
}

export async function eliminarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ofertas')
    .update({ estado: 'eliminada' })
    .eq('id', ofertaId)

  if (error) return { error: 'No se pudo eliminar la oferta.' }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  return { error: null }
}

export async function completarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('completar_oferta', { p_oferta_id: ofertaId })

  if (error) return { error: error.message }

  revalidatePath('/ofertas/mis-ofertas')
  return { error: null }
}

export async function cerrarNegociacionSinAcuerdo(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  if (!ofertaId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cerrar_negociacion_sin_acuerdo', { p_oferta_id: ofertaId })

  if (error) return { error: error.message }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}

export async function realizarOferta(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const ofertaId = String(formData.get('ofertaId') ?? '')
  const parsed = intencionSchema.safeParse({
    tipo: formData.get('tipo'),
    comentarios: formData.get('comentarios'),
  })

  if (!ofertaId) return { error: 'Solicitud inválida.' }
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada. Vuelva a ingresar.' }

  const d = parsed.data
  const { error } = await supabase.from('intenciones').insert({
    oferta_id: ofertaId,
    usuario_id: user.id,
    tipo: d.tipo,
    comentarios: d.comentarios || null,
    estado: 'enviada',
  })

  if (error) return { error: mensajeDesdeError(error) }

  // Notificar al dueño de la oferta — best-effort, no bloquea la respuesta.
  const [{ data: oferta }, { data: quienResponde }] = await Promise.all([
    supabase.from('ofertas').select('usuario_id').eq('id', ofertaId).single(),
    supabase.from('perfiles_publicos')
      .select('razon_social, contacto_nombre, contacto_celular, contacto_correo')
      .eq('id', user.id)
      .single(),
  ])
  if (oferta) {
    const { data: dueno } = await supabase
      .from('perfiles_publicos')
      .select('correo')
      .eq('id', oferta.usuario_id)
      .single()
    if (dueno && quienResponde) {
      await notificarNuevaIntencion({
        correoDueno: dueno.correo,
        empresaRespondio: quienResponde.razon_social,
        contactoRespondio: quienResponde.contacto_nombre,
        celularRespondio: quienResponde.contacto_celular,
        correoRespondio: quienResponde.contacto_correo,
        tipo: d.tipo,
        comentarios: d.comentarios || null,
      })
    }
  }

  revalidatePath('/ofertas')
  revalidatePath('/ofertas/mis-intenciones')
  return { error: null }
}

export async function marcarIntencionVista(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const intencionId = String(formData.get('intencionId') ?? '')
  if (!intencionId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('intenciones')
    .update({ estado: 'vista' })
    .eq('id', intencionId)
    .eq('estado', 'enviada')

  if (error) return { error: 'No se pudo actualizar.' }

  revalidatePath('/ofertas/mis-ofertas')
  return { error: null }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/ofertas/actions.ts
git commit -m "feat(ofertas): server actions de publicar, responder y ciclo de negociación"
```

---

### Task MK9: Tarjeta de oferta y modal "Realizar Oferta"

**Files:**
- Create: `src/app/ofertas/tarjeta-oferta.tsx`
- Create: `src/app/ofertas/modal-realizar-oferta.tsx`

- [ ] **Step 1: Crear `src/app/ofertas/tarjeta-oferta.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'
import type { Condicion, Moneda, Operacion } from '@/types/database'

const ETIQUETA_CONDICION: Record<Condicion, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  para_recoger: 'Para recoger',
  en_oficina: 'En oficina',
}

export interface DatosOferta {
  id: string
  empresa: string
  sede: string | null
  operacion: Operacion | null
  moneda: Moneda
  cantidad: number
  precioCop: number
  condiciones: Condicion[]
  notas: string | null
  expiraEn: string
}

export function TarjetaOferta({
  oferta,
  acciones,
}: {
  oferta: DatosOferta
  acciones?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            {oferta.operacion === 'venta' ? 'Vende' : 'Compra'} {oferta.moneda}
          </CardTitle>
          <CardDescription>
            {oferta.empresa}{oferta.sede ? ` · ${oferta.sede}` : ''}
          </CardDescription>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {formatearCuentaRegresiva(oferta.expiraEn)}
        </span>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cantidad</span>
          <span className="font-medium">{oferta.cantidad.toLocaleString('es-CO')} {oferta.moneda}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Precio</span>
          <span className="font-medium">${oferta.precioCop.toLocaleString('es-CO')} COP</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {oferta.condiciones.map((c) => (
            <span key={c} className="rounded-full bg-accent/40 px-2 py-0.5 text-xs">
              {ETIQUETA_CONDICION[c]}
            </span>
          ))}
        </div>
        {oferta.notas && <p className="text-muted-foreground">{oferta.notas}</p>}
        {acciones}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Crear `src/app/ofertas/modal-realizar-oferta.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { realizarOferta, type AccionState } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'

export function ModalRealizarOferta({ ofertaId }: { ofertaId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<AccionState, FormData>(
    async (prev, formData) => {
      const resultado = await realizarOferta(prev, formData)
      if (!resultado.error) setOpen(false)
      return resultado
    },
    { error: null }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Realizar Oferta</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Realizar Oferta</DialogTitle>
          <DialogDescription>
            Al enviar esta respuesta, se le compartirán sus datos de contacto
            al dueño de la publicación para que negocien directamente.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="ofertaId" value={ofertaId} />
          <div>
            <Label htmlFor="tipo" className="mb-1.5 block">Tipo de respuesta</Label>
            <select
              id="tipo"
              name="tipo"
              required
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="aceptar_precio">Acepto el precio publicado</option>
              <option value="solicitar_contacto">Quiero negociar / solicitar contacto</option>
            </select>
          </div>
          <div>
            <Label htmlFor="comentarios" className="mb-1.5 block">Comentarios (opcional)</Label>
            <Textarea id="comentarios" name="comentarios" rows={3} />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/ofertas/tarjeta-oferta.tsx src/app/ofertas/modal-realizar-oferta.tsx
git commit -m "feat(ofertas): tarjeta de oferta y modal Realizar Oferta"
```

---

### Task MK10: Tablero `/ofertas`

**Files:**
- Create: `src/app/ofertas/page.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { TarjetaOferta } from './tarjeta-oferta'
import { ModalRealizarOferta } from './modal-realizar-oferta'

export const metadata: Metadata = { title: 'Tablero de ofertas' }

export default async function OfertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('estado')
    .eq('id', user.id)
    .single()

  const { data: membresia } = await supabase
    .from('membresias')
    .select('estado')
    .eq('usuario_id', user.id)
    .eq('estado', 'activa')
    .maybeSingle()

  const puedeVerMercado = perfil?.estado === 'aprobado' && Boolean(membresia)

  const { data: ofertas } = puedeVerMercado
    ? await supabase
        .from('ofertas')
        .select('id, empresa, sede, operacion, moneda, cantidad, precio_cop, condiciones, notas, expira_en')
        .eq('estado', 'activa')
        .neq('usuario_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tablero de ofertas</h1>
            <p className="text-sm text-muted-foreground">
              Necesidades de compra/venta de divisas publicadas por otros PCD.
            </p>
          </div>
          <Button variant="outline" render={<Link href="/ofertas/mis-ofertas" />}>
            Mis ofertas
          </Button>
        </div>

        {!puedeVerMercado ? (
          <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground">
            {perfil?.estado !== 'aprobado'
              ? 'Su empresa debe estar aprobada para ver y participar en el mercado.'
              : 'Necesita una membresía activa para ver y participar en el mercado.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(ofertas ?? []).map((o) => (
              <TarjetaOferta
                key={o.id}
                oferta={{
                  id: o.id,
                  empresa: o.empresa,
                  sede: o.sede,
                  operacion: o.operacion,
                  moneda: o.moneda,
                  cantidad: o.cantidad,
                  precioCop: o.precio_cop,
                  condiciones: o.condiciones,
                  notas: o.notas,
                  expiraEn: o.expira_en,
                }}
                acciones={<ModalRealizarOferta ofertaId={o.id} />}
              />
            ))}
            {!ofertas?.length && (
              <p className="col-span-full py-10 text-center text-muted-foreground">
                No hay ofertas activas de otras empresas por ahora.
              </p>
            )}
          </div>
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/ofertas` en la lista de rutas.

- [ ] **Step 3: Commit**

```bash
git add src/app/ofertas/page.tsx
git commit -m "feat(ofertas): tablero del marketplace en /ofertas"
```

---

### Task MK11: "Mis ofertas" — publicar, negociar, historial acotado

**Files:**
- Create: `src/app/ofertas/mis-ofertas/modal-publicar-oferta.tsx`
- Create: `src/app/ofertas/mis-ofertas/page.tsx`

- [ ] **Step 1: Crear `src/app/ofertas/mis-ofertas/modal-publicar-oferta.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { publicarOferta, type AccionState } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { MONEDAS, CONDICIONES } from '@/lib/validation/oferta'

const ETIQUETA_CONDICION: Record<(typeof CONDICIONES)[number], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  para_recoger: 'Para recoger',
  en_oficina: 'En oficina',
}

export function ModalPublicarOferta({ deshabilitado, motivo }: { deshabilitado: boolean; motivo: string | null }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<AccionState, FormData>(
    async (prev, formData) => {
      const resultado = await publicarOferta(prev, formData)
      if (!resultado.error) setOpen(false)
      return resultado
    },
    { error: null }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={deshabilitado} />}>Publicar oferta</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publicar oferta</DialogTitle>
          <DialogDescription>
            Esta oferta expira automáticamente 24 horas después de publicarla.
            Si sigue vigente y quiere mantenerla, deberá publicarla de nuevo.
            De la 3ra oferta activa en adelante se consume 1 token.
          </DialogDescription>
        </DialogHeader>
        {deshabilitado && motivo && (
          <Alert variant="destructive">
            <AlertDescription>{motivo}</AlertDescription>
          </Alert>
        )}
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="operacion" className="mb-1.5 block">Operación</Label>
              <select id="operacion" name="operacion" required className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                <option value="compra">Compra</option>
                <option value="venta">Venta</option>
              </select>
            </div>
            <div>
              <Label htmlFor="moneda" className="mb-1.5 block">Moneda</Label>
              <select id="moneda" name="moneda" required className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cantidad" className="mb-1.5 block">Cantidad</Label>
              <Input id="cantidad" name="cantidad" type="text" inputMode="decimal" required />
            </div>
            <div>
              <Label htmlFor="precioCop" className="mb-1.5 block">Precio (COP)</Label>
              <Input id="precioCop" name="precioCop" type="text" inputMode="decimal" required />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Condiciones</Label>
            <div className="flex flex-wrap gap-3">
              {CONDICIONES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="condiciones" value={c} />
                  {ETIQUETA_CONDICION[c]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="sede" className="mb-1.5 block">Sede (opcional)</Label>
            <Input id="sede" name="sede" type="text" placeholder="Oviedo" />
          </div>
          <div>
            <Label htmlFor="notas" className="mb-1.5 block">Notas (opcional)</Label>
            <Textarea id="notas" name="notas" rows={2} placeholder="Ej.: están en billetes de 20" />
          </div>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Publicando…' : 'Publicar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Crear `src/app/ofertas/mis-ofertas/page.tsx`**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TarjetaOferta } from '../tarjeta-oferta'
import { ModalPublicarOferta } from './modal-publicar-oferta'
import { completarOferta, cerrarNegociacionSinAcuerdo, eliminarOferta, marcarIntencionVista } from '../actions'

export const metadata: Metadata = { title: 'Mis ofertas' }

export default async function MisOfertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membresia } = await supabase
    .from('membresias')
    .select('estado')
    .eq('usuario_id', user.id)
    .eq('estado', 'activa')
    .maybeSingle()

  const { data: todasMisOfertas } = await supabase
    .from('ofertas')
    .select('id, empresa, sede, operacion, moneda, cantidad, precio_cop, condiciones, notas, expira_en, estado, created_at')
    .eq('usuario_id', user.id)
    .order('created_at', { ascending: false })

  const activas = (todasMisOfertas ?? []).filter((o) => o.estado === 'activa' || o.estado === 'en_negociacion')
  const historial = (todasMisOfertas ?? [])
    .filter((o) => o.estado === 'expirada' || o.estado === 'eliminada' || o.estado === 'completada')
    .slice(0, 5)

  const idsActivas = activas.map((o) => o.id)
  const { data: intenciones } = idsActivas.length
    ? await supabase
        .from('intenciones')
        .select('id, oferta_id, tipo, comentarios, estado, usuario_id')
        .in('oferta_id', idsActivas)
    : { data: [] }

  const contactosPorUsuario = new Map<string, {
    razon_social: string; contacto_nombre: string; contacto_celular: string; contacto_correo: string
  }>()
  const idsUsuarios = [...new Set((intenciones ?? []).map((i) => i.usuario_id))]
  if (idsUsuarios.length) {
    const { data: contactos } = await supabase
      .from('perfiles_publicos')
      .select('id, razon_social, contacto_nombre, contacto_celular, contacto_correo')
      .in('id', idsUsuarios)
    for (const c of contactos ?? []) contactosPorUsuario.set(c.id, c)
  }

  const noPuedePublicar = !membresia ? 'Necesita una membresía activa para publicar ofertas.'
    : activas.length >= 5 ? 'Ya tiene 5 ofertas activas. Espere a que una expire, se complete o elimine una.'
    : null

  const completarBound = completarOferta.bind(null, { error: null })
  const cerrarBound = cerrarNegociacionSinAcuerdo.bind(null, { error: null })
  const eliminarBound = eliminarOferta.bind(null, { error: null })
  const marcarVistaBound = marcarIntencionVista.bind(null, { error: null })

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mis ofertas</h1>
            <p className="text-sm text-muted-foreground">
              {activas.length}/5 activas · próximas gratis: {Math.max(0, 2 - activas.length)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href="/ofertas" />}>Tablero</Button>
            <ModalPublicarOferta deshabilitado={Boolean(noPuedePublicar)} motivo={noPuedePublicar} />
          </div>
        </div>

        <section className="grid gap-4">
          {activas.map((o) => {
            const propias = (intenciones ?? []).filter((i) => i.oferta_id === o.id)
            const nuevas = propias.filter((i) => i.estado === 'enviada').length

            return (
              <TarjetaOferta
                key={o.id}
                oferta={{
                  id: o.id, empresa: o.empresa, sede: o.sede, operacion: o.operacion,
                  moneda: o.moneda, cantidad: o.cantidad, precioCop: o.precio_cop,
                  condiciones: o.condiciones, notas: o.notas, expiraEn: o.expira_en,
                }}
                acciones={
                  <div className="grid gap-3">
                    {o.estado === 'activa' && (
                      <>
                        <form action={eliminarBound}>
                          <input type="hidden" name="ofertaId" value={o.id} />
                          <Button type="submit" variant="outline" size="sm">Eliminar</Button>
                        </form>
                        {propias.length > 0 && (
                          <div className="grid gap-2 rounded-md border border-border p-3">
                            <p className="text-xs font-medium">
                              Intenciones recibidas {nuevas > 0 && <span className="text-primary">({nuevas} nuevas)</span>}
                            </p>
                            {propias.map((i) => {
                              const contacto = contactosPorUsuario.get(i.usuario_id)
                              return (
                                <div key={i.id} className="text-xs text-muted-foreground">
                                  <p>{contacto?.razon_social} · {contacto?.contacto_nombre} · {contacto?.contacto_celular} · {contacto?.contacto_correo}</p>
                                  {i.comentarios && <p>&ldquo;{i.comentarios}&rdquo;</p>}
                                  {i.estado === 'enviada' && (
                                    <form action={marcarVistaBound}>
                                      <input type="hidden" name="intencionId" value={i.id} />
                                      <Button type="submit" variant="ghost" size="sm">Marcar como vista</Button>
                                    </form>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                    {o.estado === 'en_negociacion' && (
                      <div className="flex gap-2">
                        <form action={completarBound}>
                          <input type="hidden" name="ofertaId" value={o.id} />
                          <Button type="submit" size="sm">Oferta completada</Button>
                        </form>
                        <form action={cerrarBound}>
                          <input type="hidden" name="ofertaId" value={o.id} />
                          <Button type="submit" variant="outline" size="sm">Republicar</Button>
                        </form>
                      </div>
                    )}
                  </div>
                }
              />
            )
          })}
          {!activas.length && (
            <p className="py-6 text-center text-muted-foreground">No tiene ofertas activas.</p>
          )}
        </section>

        {historial.length > 0 && (
          <section className="mt-8 grid gap-3">
            <h2 className="text-lg font-semibold">Historial reciente</h2>
            {historial.map((o) => (
              <Card key={o.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    {o.operacion === 'venta' ? 'Vende' : 'Compra'} {o.moneda} · {o.cantidad.toLocaleString('es-CO')}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{o.estado}</span>
                </CardHeader>
                <CardContent />
              </Card>
            ))}
          </section>
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/ofertas/mis-ofertas` en la lista de rutas.

- [ ] **Step 4: Commit**

```bash
git add src/app/ofertas/mis-ofertas
git commit -m "feat(ofertas): página Mis ofertas — publicar, negociar, historial acotado"
```

---

### Task MK12: "Mis intenciones" (lado de quien responde)

**Files:**
- Create: `src/app/ofertas/mis-intenciones/page.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cerrarNegociacionSinAcuerdo } from '../actions'

export const metadata: Metadata = { title: 'Mis intenciones' }

export default async function MisIntencionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: intenciones } = await supabase
    .from('intenciones')
    .select('id, oferta_id, tipo, comentarios, estado, created_at')
    .eq('usuario_id', user.id)
    .order('created_at', { ascending: false })

  const idsOfertas = [...new Set((intenciones ?? []).map((i) => i.oferta_id))]
  const { data: ofertas } = idsOfertas.length
    ? await supabase.from('ofertas').select('id, empresa, operacion, moneda, cantidad, precio_cop, estado').in('id', idsOfertas)
    : { data: [] }
  const ofertaPorId = new Map((ofertas ?? []).map((o) => [o.id, o]))

  const cerrarBound = cerrarNegociacionSinAcuerdo.bind(null, { error: null })

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Mis intenciones</h1>
          <Button variant="outline" render={<Link href="/ofertas" />}>Tablero</Button>
        </div>

        <section className="grid gap-4">
          {(intenciones ?? []).map((i) => {
            const oferta = ofertaPorId.get(i.oferta_id)
            if (!oferta) return null
            return (
              <Card key={i.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {oferta.empresa} — {oferta.operacion === 'venta' ? 'Vende' : 'Compra'} {oferta.moneda}
                  </CardTitle>
                  <CardDescription>
                    {oferta.cantidad.toLocaleString('es-CO')} {oferta.moneda} a ${oferta.precio_cop.toLocaleString('es-CO')} COP
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <p className="text-muted-foreground">Su respuesta: {i.tipo === 'aceptar_precio' ? 'Aceptó el precio' : 'Solicitó contacto'}</p>
                  {i.comentarios && <p className="text-muted-foreground">&ldquo;{i.comentarios}&rdquo;</p>}
                  {oferta.estado === 'en_negociacion' && i.estado !== 'cerrada' && (
                    <form action={cerrarBound}>
                      <input type="hidden" name="ofertaId" value={oferta.id} />
                      <Button type="submit" variant="outline" size="sm">No se realizó la negociación</Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )
          })}
          {!intenciones?.length && (
            <p className="py-10 text-center text-muted-foreground">Aún no ha respondido ninguna oferta.</p>
          )}
        </section>
      </main>
    </>
  )
}
```

- [ ] **Step 2: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/ofertas/mis-intenciones` en la lista de rutas.

- [ ] **Step 3: Commit**

```bash
git add src/app/ofertas/mis-intenciones
git commit -m "feat(ofertas): página Mis intenciones — liberar negociación sin acuerdo"
```

---

### Task MK13: Navegación y panel admin de operaciones

**Files:**
- Modify: `src/components/site-header.tsx`
- Create: `src/app/admin/operaciones/page.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Agregar el enlace "Ofertas" al header**

Contenido actual completo del archivo:

```tsx
import Link from 'next/link'
import Image from 'next/image'
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
          <Image
            src="/logo-icon.png"
            alt="Tasa Directa"
            width={36}
            height={36}
            className="rounded-lg"
            priority
          />
          <span className="text-lg font-semibold tracking-tight">Tasa Directa</span>
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Button variant="ghost" render={<Link href="/dashboard" />}>
                Mi cuenta
              </Button>
              {esAdmin && (
                <Button variant="ghost" render={<Link href="/admin" />}>
                  Cumplimiento
                </Button>
              )}
              <form action={cerrarSesion}>
                <Button variant="outline" type="submit">Salir</Button>
              </form>
            </>
          ) : (
            <>
              <Button variant="ghost" render={<Link href="/login" />}>
                Ingresar
              </Button>
              <Button render={<Link href="/registro" />}>
                Registrarse
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
```

Reemplazar el bloque `{user ? (...)}` por:

```tsx
          {user ? (
            <>
              {!esAdmin && (
                <Button variant="ghost" render={<Link href="/ofertas" />}>
                  Ofertas
                </Button>
              )}
              <Button variant="ghost" render={<Link href="/dashboard" />}>
                Mi cuenta
              </Button>
              {esAdmin && (
                <>
                  <Button variant="ghost" render={<Link href="/admin" />}>
                    Cumplimiento
                  </Button>
                  <Button variant="ghost" render={<Link href="/admin/operaciones" />}>
                    Operaciones
                  </Button>
                </>
              )}
              <form action={cerrarSesion}>
                <Button variant="outline" type="submit">Salir</Button>
              </form>
            </>
          ) : (
```

(el resto del archivo no cambia)

- [ ] **Step 2: Crear `src/app/admin/operaciones/page.tsx`**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatearCuentaRegresiva } from '@/lib/ofertas/tiempo'
import { eliminarOferta } from '@/app/ofertas/actions'

export const metadata: Metadata = { title: 'Operaciones' }

export default async function OperacionesPage() {
  const supabase = await createClient()

  const { data: ofertas } = await supabase
    .from('ofertas')
    .select('id, empresa, operacion, moneda, cantidad, precio_cop, estado, expira_en, usuario_id')
    .in('estado', ['activa', 'en_negociacion'])
    .order('created_at', { ascending: false })

  const ids = (ofertas ?? []).map((o) => o.id)
  const { data: intenciones } = ids.length
    ? await supabase.from('intenciones').select('oferta_id, estado').in('oferta_id', ids)
    : { data: [] }

  const conteoIntenciones = (ofertaId: string) =>
    (intenciones ?? []).filter((i) => i.oferta_id === ofertaId).length

  const eliminarBound = eliminarOferta.bind(null, { error: null })

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/admin" />}>← Volver</Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operaciones</h1>
        <p className="text-sm text-muted-foreground">Ofertas activas y en negociación en toda la plataforma.</p>
      </div>

      <div className="rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Operación</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Intenciones</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ofertas ?? []).map((o) => (
              <TableRow key={o.id}>
                <TableCell>{o.empresa}</TableCell>
                <TableCell>{o.operacion === 'venta' ? 'Vende' : 'Compra'} {o.moneda}</TableCell>
                <TableCell>{o.cantidad.toLocaleString('es-CO')}</TableCell>
                <TableCell>${o.precio_cop.toLocaleString('es-CO')}</TableCell>
                <TableCell>{o.estado === 'en_negociacion' ? 'En negociación' : 'Activa'}</TableCell>
                <TableCell className="text-xs">{formatearCuentaRegresiva(o.expira_en)}</TableCell>
                <TableCell>{conteoIntenciones(o.id)}</TableCell>
                <TableCell>
                  <form action={eliminarBound}>
                    <input type="hidden" name="ofertaId" value={o.id} />
                    <Button type="submit" variant="destructive" size="sm">Eliminar</Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {!ofertas?.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No hay ofertas activas ni en negociación.
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

- [ ] **Step 3: Agregar el enlace en `/admin`**

Contenido actual completo del bloque a cambiar en `src/app/admin/page.tsx`
(el resto del archivo, incluidos los imports de `Link` y `Button` que ya
existen, no cambia):

```tsx
      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            variant={f.valor === estado ? 'default' : 'outline'}
            size="sm"
            render={<Link href={`/admin?estado=${f.valor}`} />}
          >
            {f.etiqueta}
          </Button>
        ))}
      </div>
```

Reemplazar por:

```tsx
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {FILTROS.map((f) => (
            <Button
              key={f.valor}
              variant={f.valor === estado ? 'default' : 'outline'}
              size="sm"
              render={<Link href={`/admin?estado=${f.valor}`} />}
            >
              {f.etiqueta}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" render={<Link href="/admin/operaciones" />}>
          Operaciones
        </Button>
      </div>
```

- [ ] **Step 4: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/admin/operaciones` en la lista de rutas.

- [ ] **Step 5: Commit**

```bash
git add src/components/site-header.tsx src/app/admin/operaciones src/app/admin/page.tsx
git commit -m "feat(ofertas): navegación a Ofertas y panel admin de Operaciones"
```

---

### Task MK14: Verificación final, docs y deploy

**Files:**
- Modify: `README.md`
- Modify: `docs/CONTEXTO-PROYECTO.md`

- [ ] **Step 1: Verificación completa**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: todo limpio; build incluye `/ofertas`, `/ofertas/mis-ofertas`, `/ofertas/mis-intenciones`, `/admin/operaciones`; todos los tests pasan (los nuevos de oferta/intencion/tiempo/resend/notificaciones más los existentes).

- [ ] **Step 2: Verificación en navegador (preview tools)**

Con dos cuentas PCD aprobadas y con membresía activa:
1. Cuenta A publica una oferta en `/ofertas/mis-ofertas` — confirmar disclaimer, cuenta regresiva, y que aparece en `/ofertas` para la cuenta B (no para A).
2. Cuenta B hace clic en "Realizar Oferta" — confirmar que la oferta de A pasa a "En negociación" y ya no acepta más intenciones de un tercero.
3. Cuenta A ve la intención con el contacto de B revelado; prueba "Oferta completada" y, en otra oferta, "Republicar".
4. Cuenta B, desde "Mis intenciones", prueba "No se realizó la negociación" y confirma que la oferta original vuelve a `/ofertas`.
5. Publicar una 3ra oferta activa sin tokens suficientes — confirmar el mensaje de saldo insuficiente.
6. Admin entra a `/admin/operaciones` y ve las ofertas activas/en negociación; elimina una y confirma que desaparece.

- [ ] **Step 3: Actualizar `README.md`**

Agregar, después de la sección "Verificación de identidad (Didit)" y antes de "Roadmap por fases":

```markdown
## Marketplace de ofertas

PCD aprobados con membresía activa pueden publicar su necesidad de compra/venta
de divisas en `/ofertas/mis-ofertas` (hasta 5 ofertas activas simultáneas: las
primeras 2 gratis, de la 3ra en adelante consume 1 token cada una). Cada oferta
expira 24 horas después de publicarse. Otros PCD la ven en el tablero `/ofertas`
y responden con "Realizar Oferta" (revela datos de contacto para negociar fuera
de la plataforma), lo que pone la oferta en estado `en_negociacion` y bloquea
nuevas respuestas. Desde ahí, el dueño puede marcarla "Oferta completada" o
"Republicar", y quien respondió puede marcar "No se realizó la negociación" —
ambas acciones reactivan la misma oferta (24h nuevas) sin costo. Al cancelar la
membresía de un PCD se eliminan automáticamente todas sus ofertas activas. Ver
`supabase/migrations/0007_marketplace_ofertas.sql` y el spec en
`docs/superpowers/specs/2026-07-21-marketplace-ofertas-design.md`.
```

- [ ] **Step 4: Actualizar `docs/CONTEXTO-PROYECTO.md`**

En la tabla "Estado de fases", agregar una fila (reemplazando las filas `3` y `4` pendientes por una sola fila `✅`, ya que este plan cubre ambas):

```markdown
| 3+4 — Marketplace y su UI | ✅ | Publicar/ver ofertas, ciclo de negociación, panel admin de Operaciones — ver README |
```

En "Pendiente explícito", agregar un punto:

```markdown
5. **Notificación por Telegram/WhatsApp de nuevas intenciones** — se dejó
   fuera de esta fase a propósito (por ahora solo correo + badge en
   plataforma); evaluar junto con el resto de Fase 5 (Notificaciones y DevOps).
```

- [ ] **Step 5: Commit y push**

```bash
git add README.md docs/CONTEXTO-PROYECTO.md
git commit -m "docs: documenta el marketplace de ofertas (Fase 3+4)"
git push
```

- [ ] **Step 6: Confirmar deploy de Preview**

Confirmar que el nuevo Preview de Vercel construyó OK. Recordar que
`RESEND_API_KEY` ya está cargada en Vercel (Production/Preview/Development) —
no hace falta configurarla de nuevo. Recordar también que Jaime debe correr
`supabase/migrations/0007_marketplace_ofertas.sql` en el SQL Editor de
Supabase antes de que cualquiera de esto funcione contra la base real.

---

## Self-Review

- **Cobertura del spec:** columnas/estados/cron (MK1) ✓; tipos (MK2) ✓;
  validación oferta/intención (MK3-MK4) ✓; cuenta regresiva (MK5) ✓; cliente
  Resend + notificación de intención (MK6-MK7) ✓; server actions completas
  incluyendo el ciclo de negociación (MK8) ✓; tarjeta + modal Realizar Oferta
  (MK9) ✓; tablero (MK10) ✓; Mis ofertas con publicar/negociar/historial
  acotado a 5 (MK11) ✓; Mis intenciones con liberar sin acuerdo (MK12) ✓;
  navegación + admin Operaciones con eliminar (MK13) ✓; docs + deploy (MK14) ✓.
- **Placeholders:** ninguno — cada step tiene código completo, incluidos los
  archivos completos actuales antes de mostrar el reemplazo en MK13 Step 1.
- **Consistencia de tipos:** `EstadoOferta` se amplía en MK2 y se usa igual en
  MK9-MK13. `completar_oferta`/`cerrar_negociacion_sin_acuerdo` se definen en
  MK1 (SQL) y MK2 (tipos TS) con la misma firma `{ p_oferta_id: string }`, y
  se llaman igual vía `supabase.rpc(...)` en MK8. `formatearCuentaRegresiva`
  se define en MK5 y se consume sin cambios en MK9/MK13. `enviarCorreo` se
  define en MK6 y `notificarNuevaIntencion` lo consume igual en MK7 y MK8.
