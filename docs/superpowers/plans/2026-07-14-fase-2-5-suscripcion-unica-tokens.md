# Fase 2.5 — Modelo comercial: Suscripción Única + Billetera de Tokens · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el modelo Plus/Premium con cuotas diarias por el modelo aprobado el 2026-07-14: **una sola suscripción** (tipo `estandar`, sin límites de publicaciones/intenciones) + **billetera de tokens** (infraestructura completa: saldo, ledger de movimientos, funciones de otorgar/consumir) lista para los futuros servicios tokenizables (destacar, alertas premium, urgente, republicación). El cobro con Bold queda diseñado con stub (como la validación de identidad): mientras Jaime gestiona su cuenta Bold, el admin activa membresías manualmente desde el panel tras confirmar el pago.

**Architecture:** Todo el estado comercial vive en Postgres con RLS: la tabla `membresias` se conserva (solo cambia el enum de tipo y desaparecen las cuotas), y se agregan `token_saldos` (saldo con lock de fila) + `token_movimientos` (ledger inmutable). Los movimientos de tokens SOLO ocurren vía funciones `SECURITY DEFINER` (`otorgar_tokens` admin-only, `consumir_tokens` self-service para futuros servicios) — el cliente jamás escribe esas tablas directamente. Los triggers de ofertas/intenciones dejan de contar cuotas y pasan a verificar solo: PCD aprobado + membresía activa. UI: el dashboard del PCD muestra su membresía y saldo; el expediente del admin gana una sección "Gestión comercial" (activar/cancelar membresía, otorgar tokens).

**Tech Stack:** igual que Fase 2 — Next.js 16 App Router, Supabase (RLS + funciones definer), shadcn/ui sobre Base UI (`render` prop, NO `asChild`), Server Actions con el patrón wrapper-void ya establecido en `admin/usuarios/[id]/page.tsx`, Vitest para lógica pura.

**Decisiones de producto congeladas (Jaime, 2026-07-14):**
1. NO hay tiers Plus/Premium ni cuotas diarias. Una sola suscripción = acceso total (publicar + responder sin límite).
2. Tokens para servicios de atención (destacar, alerta premium WhatsApp/Telegram, oferta urgente, republicación automática) — la INFRAESTRUCTURA se construye ahora; los SERVICIOS se activan después, cuando haya tráfico.
3. Cobro por empresa (NIT), no por sede. (Sedes múltiples = feature de datos para Fase 3, fuera de este plan.)
4. Bold para pagos (links + futuro webhook). Mientras tanto: flujo manual — aprobar PCD → Telegram avisa a Jaime → Jaime envía link Bold → confirma pago → activa membresía en el panel.
5. Nunca vender ventajas de información privilegiada (ej. ver ofertas antes que otros) — solo visibilidad y velocidad de notificación. Regla de marca.

**Contexto del código existente (verificado):** rama `fase-2-kyc` (NO fusionada a master; este plan se apila encima y todo se fusiona junto tras el E2E completo). En `0001a_esquema_sin_cron.sql`: `membresias.tipo` tiene check `('plus','premium')` (línea 73), índice único `uniq_membresia_activa` sobre `(usuario_id) where estado='activa'` (línea 81), `limite_diario()` (línea 131), triggers `trg_cuota_oferta`→`verificar_cuota_oferta()` y `trg_cuota_intencion`→`verificar_cuota_intencion()`. RLS de `membresias`: usuario lee la propia, admin gestiona todo (ya existe, no se toca). `admin/actions.ts` tiene `exigirAdmin()` y el patrón `AdminState`. `src/lib/telegram/notificar.ts` existe. Button es Base UI (`render`, no `asChild`).

---

## Estructura de archivos

```
supabase/migrations/
  0003_modelo_comercial.sql          ← membresía única + tokens + triggers sin cuota

src/
  types/database.ts                  ← MODIFICAR: TipoMembresia, tablas tokens, funciones
  lib/validation/membresia.ts        ← helper puro esMembresiaVigente (TDD)
  lib/validation/tokens.ts           ← constantes de conceptos + etiquetas (TDD ligero)
  app/dashboard/page.tsx             ← MODIFICAR: card Membresía + Tokens
  app/admin/actions.ts               ← MODIFICAR: activarMembresia, cancelarMembresia, otorgarTokens
                                        + notificación Telegram en aprobarUsuario
  app/admin/usuarios/[id]/page.tsx   ← MODIFICAR: montar sección de gestión comercial
  app/admin/usuarios/[id]/gestion-comercial.tsx  ← NUEVA sección (server component)
  app/api/webhooks/bold/route.ts     ← stub 501 (contrato estable)

tests/validation/membresia.test.ts
tests/validation/tokens.test.ts

docs/arquitectura-pagos-bold.md      ← diseño de la integración Bold
.env.example                         ← MODIFICAR: BOLD_SECRET_KEY, BOLD_WEBHOOK_SECRET
README.md                            ← MODIFICAR: modelo comercial actualizado
docs/decisiones-fase-1.md            ← MODIFICAR: anotar el cambio de modelo (histórico)
```

---

### Task M1: Migration 0003 — modelo comercial en la base de datos

**Files:**
- Create: `supabase/migrations/0003_modelo_comercial.sql`

**La corre Jaime en el SQL Editor de Supabase** (no hay CLI conectado). Idempotente.

- [ ] **Step 1: Escribir la migration**

```sql
-- =============================================================================
-- TASA DIRECTA · Fase 2.5 · Modelo comercial: suscripción única + tokens
-- Decisión de producto 2026-07-14:
--   · Desaparecen los tiers Plus/Premium y las cuotas diarias.
--   · Una sola membresía tipo 'estandar' = acceso total al mercado.
--   · Billetera de tokens (saldo + ledger) para futuros servicios de atención.
-- Idempotente: se puede correr varias veces.
-- =============================================================================

-- -----------------------------------------------------------------------
-- 1. Membresía única 'estandar'
-- -----------------------------------------------------------------------
update public.membresias set tipo = 'estandar' where tipo in ('plus','premium');

alter table public.membresias drop constraint if exists membresias_tipo_check;
alter table public.membresias
  add constraint membresias_tipo_check check (tipo in ('estandar'));

-- ¿Membresía vigente hoy (hora Colombia)?
create or replace function public.tiene_membresia_activa(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membresias
    where usuario_id = uid
      and estado = 'activa'
      and fecha_inicio <= public.fecha_colombia()
      and (fecha_fin is null or fecha_fin >= public.fecha_colombia())
  );
$$;

-- -----------------------------------------------------------------------
-- 2. Triggers de acceso al mercado SIN cuotas
--    (aprobado + membresía activa; se eliminan los conteos diarios)
-- -----------------------------------------------------------------------
drop trigger if exists trg_cuota_oferta on public.ofertas;
drop trigger if exists trg_acceso_oferta on public.ofertas;
drop function if exists public.verificar_cuota_oferta();

create or replace function public.verificar_acceso_oferta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.es_aprobado(new.usuario_id) then
    raise exception 'El usuario no está aprobado para publicar ofertas.'
      using errcode = 'check_violation';
  end if;
  if not public.tiene_membresia_activa(new.usuario_id) then
    raise exception 'Se requiere una membresía activa para publicar ofertas.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_acceso_oferta
  before insert on public.ofertas
  for each row execute function public.verificar_acceso_oferta();

drop trigger if exists trg_cuota_intencion on public.intenciones;
drop trigger if exists trg_acceso_intencion on public.intenciones;
drop function if exists public.verificar_cuota_intencion();

create or replace function public.verificar_acceso_intencion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_estado text;
begin
  if not public.es_aprobado(new.usuario_id) then
    raise exception 'El usuario no está aprobado para realizar intenciones.'
      using errcode = 'check_violation';
  end if;
  if not public.tiene_membresia_activa(new.usuario_id) then
    raise exception 'Se requiere una membresía activa para realizar intenciones.'
      using errcode = 'check_violation';
  end if;

  select usuario_id, estado into v_owner, v_estado
  from public.ofertas where id = new.oferta_id;

  if v_owner = new.usuario_id then
    raise exception 'No puede realizar una intención sobre su propia publicación.'
      using errcode = 'check_violation';
  end if;
  if v_estado is distinct from 'activa' then
    raise exception 'Solo se pueden realizar intenciones sobre ofertas activas.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_acceso_intencion
  before insert on public.intenciones
  for each row execute function public.verificar_acceso_intencion();

-- limite_diario ya no aplica (no hay cuotas)
drop function if exists public.limite_diario(uuid);

-- -----------------------------------------------------------------------
-- 3. Billetera de tokens: saldo + ledger
-- -----------------------------------------------------------------------
create table if not exists public.token_saldos (
  usuario_id uuid primary key references public.perfiles_usuarios(id) on delete cascade,
  saldo      integer not null default 0 check (saldo >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_movimientos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles_usuarios(id) on delete cascade,
  delta      integer not null check (delta <> 0),
  concepto   text not null check (concepto in
             ('compra','ajuste_admin','destacar_oferta','alerta_premium',
              'oferta_urgente','republicacion','reembolso')),
  referencia uuid,           -- id de la oferta/pago asociado (opcional)
  nota       text,
  creado_por uuid references public.perfiles_usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_token_mov_usuario
  on public.token_movimientos(usuario_id, created_at desc);

drop trigger if exists trg_upd_token_saldos on public.token_saldos;
create trigger trg_upd_token_saldos
  before update on public.token_saldos
  for each row execute function public.set_updated_at();

-- RLS: lectura propia o admin; NADIE escribe directo (solo funciones definer)
alter table public.token_saldos      enable row level security;
alter table public.token_movimientos enable row level security;

drop policy if exists "tokens: leer saldo propio" on public.token_saldos;
create policy "tokens: leer saldo propio" on public.token_saldos
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "tokens: leer movimientos propios" on public.token_movimientos;
create policy "tokens: leer movimientos propios" on public.token_movimientos
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

-- -----------------------------------------------------------------------
-- 4. Funciones de la billetera (única vía de escritura)
-- -----------------------------------------------------------------------

-- Otorgar tokens (solo admin): compras confirmadas por Bold, ajustes, cortesías.
create or replace function public.otorgar_tokens(
  p_usuario uuid, p_cantidad integer, p_nota text default null,
  p_concepto text default 'ajuste_admin', p_referencia uuid default null
)
returns integer  -- nuevo saldo
language plpgsql security definer set search_path = public as $$
declare
  v_saldo integer;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede otorgar tokens.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser un entero positivo.'
      using errcode = 'check_violation';
  end if;
  if p_concepto not in ('compra','ajuste_admin','reembolso') then
    raise exception 'Concepto inválido para otorgar tokens.'
      using errcode = 'check_violation';
  end if;

  insert into public.token_saldos (usuario_id, saldo) values (p_usuario, 0)
  on conflict (usuario_id) do nothing;

  update public.token_saldos set saldo = saldo + p_cantidad
  where usuario_id = p_usuario
  returning saldo into v_saldo;

  insert into public.token_movimientos
    (usuario_id, delta, concepto, referencia, nota, creado_por)
  values (p_usuario, p_cantidad, p_concepto, p_referencia, p_nota, auth.uid());

  return v_saldo;
end;
$$;

-- Consumir tokens (el propio usuario): la usarán los servicios tokenizables.
-- Atómica: bloquea la fila de saldo, valida fondos, descuenta y registra.
create or replace function public.consumir_tokens(
  p_cantidad integer, p_concepto text, p_referencia uuid default null,
  p_nota text default null
)
returns integer  -- nuevo saldo
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
  if p_concepto not in ('destacar_oferta','alerta_premium','oferta_urgente','republicacion') then
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
```

- [ ] **Step 2: Jaime la corre en Supabase** → Expected: `Success. No rows returned`.

- [ ] **Step 3: Verificación en SQL Editor**

```sql
select proname from pg_proc where proname in
  ('tiene_membresia_activa','otorgar_tokens','consumir_tokens',
   'verificar_acceso_oferta','verificar_acceso_intencion');            -- 5 filas
select tgname from pg_trigger where tgname like 'trg_acceso%';         -- 2 filas
select policyname from pg_policies where tablename like 'token%';     -- 2 filas
select proname from pg_proc where proname = 'limite_diario';           -- 0 filas
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_modelo_comercial.sql
git commit -m "feat(db): fase 2.5 — suscripción única sin cuotas y billetera de tokens"
```

---

### Task M2: Tipos + helpers de membresía y tokens (TDD)

**Files:**
- Modify: `src/types/database.ts`
- Test: `tests/validation/membresia.test.ts`
- Test: `tests/validation/tokens.test.ts`
- Create: `src/lib/validation/membresia.ts`
- Create: `src/lib/validation/tokens.ts`

- [ ] **Step 1: Actualizar `src/types/database.ts`**

Cambios puntuales (el resto del archivo NO se toca):

1. `export type TipoMembresia = 'plus' | 'premium'` → `export type TipoMembresia = 'estandar'`
2. Agregar tipo: `export type TokenConcepto = 'compra' | 'ajuste_admin' | 'destacar_oferta' | 'alerta_premium' | 'oferta_urgente' | 'republicacion' | 'reembolso'`
3. Dentro de `Tables`, agregar (con `Relationships: []` como las demás — requisito de supabase-js v2.110):

```ts
      token_saldos: {
        Row: {
          usuario_id: string
          saldo:      number
          updated_at: string
        }
        Insert: never   // solo escriben las funciones definer
        Update: never
        Relationships: []
      }
      token_movimientos: {
        Row: {
          id:         string
          usuario_id: string
          delta:      number
          concepto:   TokenConcepto
          referencia: string | null
          nota:       string | null
          creado_por: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
```

4. En `Functions`: eliminar `limite_diario` y agregar:

```ts
      tiene_membresia_activa: { Args: { uid?: string }; Returns: boolean }
      otorgar_tokens: {
        Args: { p_usuario: string; p_cantidad: number; p_nota?: string; p_concepto?: string; p_referencia?: string }
        Returns: number
      }
      consumir_tokens: {
        Args: { p_cantidad: number; p_concepto: string; p_referencia?: string; p_nota?: string }
        Returns: number
      }
```

- [ ] **Step 2: Tests (fallan primero)**

`tests/validation/membresia.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { esMembresiaVigente } from '@/lib/validation/membresia'

const HOY = '2026-07-14'

describe('esMembresiaVigente', () => {
  it('true: activa sin fecha de fin', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-01-01', fecha_fin: null }, HOY)).toBe(true)
  })
  it('true: activa con fin en el futuro', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01' }, HOY)).toBe(true)
  })
  it('true: fin exactamente hoy (inclusive)', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-07-01', fecha_fin: HOY }, HOY)).toBe(true)
  })
  it('false: fecha_fin ya pasó', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-01-01', fecha_fin: '2026-07-13' }, HOY)).toBe(false)
  })
  it('false: aún no inicia', () => {
    expect(esMembresiaVigente({ estado: 'activa', fecha_inicio: '2026-08-01', fecha_fin: null }, HOY)).toBe(false)
  })
  it('false: cancelada o vencida aunque las fechas cubran hoy', () => {
    expect(esMembresiaVigente({ estado: 'cancelada', fecha_inicio: '2026-01-01', fecha_fin: null }, HOY)).toBe(false)
    expect(esMembresiaVigente({ estado: 'vencida', fecha_inicio: '2026-01-01', fecha_fin: null }, HOY)).toBe(false)
  })
  it('false: null (sin membresía)', () => {
    expect(esMembresiaVigente(null, HOY)).toBe(false)
  })
})
```

`tests/validation/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ETIQUETAS_CONCEPTO, esCredito } from '@/lib/validation/tokens'

describe('tokens', () => {
  it('define etiqueta para los 7 conceptos del ledger', () => {
    expect(Object.keys(ETIQUETAS_CONCEPTO)).toHaveLength(7)
  })
  it('esCredito distingue abonos de consumos', () => {
    expect(esCredito(10)).toBe(true)
    expect(esCredito(-3)).toBe(false)
  })
})
```

- [ ] **Step 3: Correr `npm test`** → Expected: FAIL (`Cannot find module '@/lib/validation/membresia'`).

- [ ] **Step 4: Implementar**

`src/lib/validation/membresia.ts`:

```ts
import type { EstadoMembresia } from '@/types/database'

export interface MembresiaResumen {
  estado: EstadoMembresia
  fecha_inicio: string   // 'YYYY-MM-DD'
  fecha_fin: string | null
}

/**
 * Réplica en UI de public.tiene_membresia_activa() — la barrera real es el
 * trigger de la BD; esto solo pinta el estado correcto en pantalla.
 * `hoy` en formato 'YYYY-MM-DD' (fecha Colombia provista por el caller).
 */
export function esMembresiaVigente(
  m: MembresiaResumen | null | undefined,
  hoy: string
): boolean {
  if (!m || m.estado !== 'activa') return false
  if (m.fecha_inicio > hoy) return false
  if (m.fecha_fin !== null && m.fecha_fin < hoy) return false
  return true
}

/** Fecha de hoy en zona América/Bogotá, formato YYYY-MM-DD. */
export function fechaColombiaHoy(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}
```

`src/lib/validation/tokens.ts`:

```ts
import type { TokenConcepto } from '@/types/database'

export const ETIQUETAS_CONCEPTO: Record<TokenConcepto, string> = {
  compra: 'Compra de tokens',
  ajuste_admin: 'Ajuste del administrador',
  destacar_oferta: 'Destacar oferta',
  alerta_premium: 'Alerta premium',
  oferta_urgente: 'Oferta urgente',
  republicacion: 'Republicación automática',
  reembolso: 'Reembolso',
}

export function esCredito(delta: number): boolean {
  return delta > 0
}
```

- [ ] **Step 5: `npm test`** → Expected: PASS — 23 tests (14 existentes + 9 nuevos). **Step 6: `npm run build`** limpio. **Step 7: Commit** `feat: tipos y helpers del modelo comercial (membresía única + tokens)`.

---

### Task M3: Dashboard del PCD — card de Membresía y Tokens

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Ampliar la consulta y agregar la card**

En `DashboardPage`, ampliar el `Promise.all` existente con dos consultas más:

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('*').eq('usuario_id', user.id),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', user.id).maybeSingle(),
  ])
```

Imports nuevos: `esMembresiaVigente, fechaColombiaHoy` de `@/lib/validation/membresia`; `Coins, BadgeCheck` de `lucide-react`.

Debajo del bloque de alerts de estado (y SOLO cuando `perfil.estado === 'aprobado'`), insertar la sección:

```tsx
      {perfil.estado === 'aprobado' && (() => {
        const vigente = esMembresiaVigente(membresia, fechaColombiaHoy())
        const saldo = saldoRow?.saldo ?? 0
        return (
          <section className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Membresía</CardTitle>
                <BadgeCheck className={vigente ? 'size-5 text-primary' : 'size-5 text-muted-foreground'} />
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {vigente ? (
                  <>
                    <p className="font-medium text-primary">Activa</p>
                    <p className="text-muted-foreground">
                      Acceso total al mercado: publicaciones e intenciones sin límite.
                      {membresia?.fecha_fin ? ` Vigente hasta ${membresia.fecha_fin}.` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Inactiva</p>
                    <p className="text-muted-foreground">
                      Su empresa está verificada. Para activar el acceso al mercado,
                      nuestro equipo le enviará el enlace de pago de la suscripción.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Tokens</CardTitle>
                <Coins className="size-5 text-primary" />
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <p className="text-2xl font-bold tracking-tight">{saldo}</p>
                <p className="text-muted-foreground">
                  Los tokens le permitirán acceder a servicios como destacar sus
                  ofertas o recibir alertas premium (próximamente).
                </p>
              </CardContent>
            </Card>
          </section>
        )
      })()}
```

- [ ] **Step 2: `npm run build`** limpio. **Step 3: Commit** `feat: card de membresía y saldo de tokens en el dashboard del PCD`.

---

### Task M4: Panel admin — Gestión comercial + aviso Telegram al aprobar

**Files:**
- Modify: `src/app/admin/actions.ts`
- Create: `src/app/admin/usuarios/[id]/gestion-comercial.tsx`
- Modify: `src/app/admin/usuarios/[id]/page.tsx`

- [ ] **Step 1: Nuevas Server Actions en `src/app/admin/actions.ts`**

Agregar imports: `notificarTelegram` de `@/lib/telegram/notificar`. Agregar al final:

```ts
export async function activarMembresia(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!usuarioId) return { error: 'Solicitud inválida.' }

  // El índice único uniq_membresia_activa garantiza una sola activa por usuario.
  const { error } = await supabase.from('membresias').insert({
    usuario_id: usuarioId,
    tipo: 'estandar',
    estado: 'activa',
    fecha_inicio: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
    fecha_fin: null,
  })

  if (error) {
    return { error: 'No se pudo activar (¿ya tiene una membresía activa?).' }
  }
  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function cancelarMembresia(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!usuarioId) return { error: 'Solicitud inválida.' }

  const { error } = await supabase
    .from('membresias')
    .update({ estado: 'cancelada' })
    .eq('usuario_id', usuarioId)
    .eq('estado', 'activa')

  if (error) return { error: 'No se pudo cancelar la membresía.' }
  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function otorgarTokens(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  const cantidad = Number(formData.get('cantidad'))
  const nota = String(formData.get('nota') ?? '').trim()

  if (!usuarioId || !Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 100000) {
    return { error: 'Cantidad inválida: debe ser un entero entre 1 y 100.000.' }
  }

  const { error } = await supabase.rpc('otorgar_tokens', {
    p_usuario: usuarioId,
    p_cantidad: cantidad,
    p_nota: nota || undefined,
  })

  if (error) return { error: 'No se pudieron otorgar los tokens.' }
  revalidatePath('/admin', 'layout')
  return { error: null }
}
```

Además, en `aprobarUsuario` (ya existente), justo después del `update` exitoso de `perfiles_usuarios` y antes del `revalidatePath`, agregar la notificación operativa (Jaime envía el link Bold al recibirla). Ampliar la consulta de docs existente NO es necesario; hacer una consulta puntual:

```ts
  const { data: perfilAprobado } = await supabase
    .from('perfiles_usuarios')
    .select('razon_social, nit, correo')
    .eq('id', usuarioId)
    .single()

  await notificarTelegram(
    `✅ <b>PCD aprobado</b>\n${perfilAprobado?.razon_social ?? usuarioId}\nNIT: ${perfilAprobado?.nit ?? '—'}\nCorreo: ${perfilAprobado?.correo ?? '—'}\n➡️ Enviar enlace de pago Bold para activar la membresía.`
  )
```

- [ ] **Step 2: Sección de gestión comercial (server component)**

`src/app/admin/usuarios/[id]/gestion-comercial.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { esMembresiaVigente, fechaColombiaHoy, type MembresiaResumen } from '@/lib/validation/membresia'
import { ETIQUETAS_CONCEPTO } from '@/lib/validation/tokens'
import { activarMembresia, cancelarMembresia, otorgarTokens } from '../../actions'
import type { TokenConcepto } from '@/types/database'

interface Movimiento {
  id: string
  delta: number
  concepto: TokenConcepto
  nota: string | null
  created_at: string
}

export function GestionComercial({
  usuarioId,
  membresia,
  saldo,
  movimientos,
}: {
  usuarioId: string
  membresia: MembresiaResumen | null
  saldo: number
  movimientos: Movimiento[]
}) {
  const vigente = esMembresiaVigente(membresia, fechaColombiaHoy())

  const activarBound = activarMembresia.bind(null, { error: null })
  const cancelarBound = cancelarMembresia.bind(null, { error: null })
  const otorgarBound = otorgarTokens.bind(null, { error: null })

  const activarAction = async (formData: FormData) => {
    'use server'
    await activarBound(formData)
  }
  const cancelarAction = async (formData: FormData) => {
    'use server'
    await cancelarBound(formData)
  }
  const otorgarAction = async (formData: FormData) => {
    'use server'
    await otorgarBound(formData)
  }

  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold">Gestión comercial</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Membresía</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {vigente ? (
              <>
                <p className="font-medium text-primary">
                  Activa desde {membresia?.fecha_inicio}
                  {membresia?.fecha_fin ? ` · hasta ${membresia.fecha_fin}` : ' · sin vencimiento'}
                </p>
                <form action={cancelarAction}>
                  <input type="hidden" name="usuarioId" value={usuarioId} />
                  <Button type="submit" variant="destructive" size="sm">
                    Cancelar membresía
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Sin membresía activa. Activar tras confirmar el pago (enlace Bold).
                </p>
                <form action={activarAction}>
                  <input type="hidden" name="usuarioId" value={usuarioId} />
                  <Button type="submit" size="sm">Activar membresía</Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens · saldo: {saldo}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <form action={otorgarAction} className="grid gap-2">
              <input type="hidden" name="usuarioId" value={usuarioId} />
              <Input
                name="cantidad"
                type="number"
                min={1}
                max={100000}
                placeholder="Cantidad de tokens"
                required
              />
              <Textarea
                name="nota"
                rows={1}
                placeholder="Nota (ej. 'Compra pack 50 — pago Bold #123')"
              />
              <Button type="submit" size="sm" className="w-fit">Otorgar tokens</Button>
            </form>
            {movimientos.length > 0 && (
              <ul className="grid gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>{ETIQUETAS_CONCEPTO[m.concepto]}{m.nota ? ` — ${m.nota}` : ''}</span>
                    <span className={m.delta > 0 ? 'text-primary' : 'text-destructive'}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Montarla en el expediente**

En `src/app/admin/usuarios/[id]/page.tsx`: importar `GestionComercial`, ampliar el `Promise.all` existente con:

```ts
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', id).maybeSingle(),
    supabase.from('token_movimientos')
      .select('id, delta, concepto, nota, created_at')
      .eq('usuario_id', id).order('created_at', { ascending: false }).limit(5),
```

(destructurar como `{ data: membresia }`, `{ data: saldoRow }`, `{ data: movimientos }`), y renderizar — solo si `perfil.estado === 'aprobado'` — entre la sección de Documentos y la de Decisión final:

```tsx
      {perfil.estado === 'aprobado' && (
        <GestionComercial
          usuarioId={perfil.id}
          membresia={membresia}
          saldo={saldoRow?.saldo ?? 0}
          movimientos={movimientos ?? []}
        />
      )}
```

- [ ] **Step 4: `npm run build && npm run lint && npm test`** → limpios, 23 tests. **Step 5: Commit** `feat: gestión comercial en el expediente admin y aviso Telegram al aprobar PCD`.

---

### Task M5: Arquitectura Bold — documento + stub del webhook

**Files:**
- Create: `docs/arquitectura-pagos-bold.md`
- Create: `src/app/api/webhooks/bold/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Documento de arquitectura**

`docs/arquitectura-pagos-bold.md`:

```markdown
# Arquitectura — Pagos con Bold (suscripción + paquetes de tokens)

## Modelo comercial (decisión 2026-07-14)
- **Suscripción única** tipo `estandar`: acceso total al mercado, sin cuotas.
- **Tokens prepagados** para servicios de atención (destacar, alertas premium,
  urgente, republicación). Regla de marca: nunca vender información
  privilegiada — solo visibilidad y velocidad de notificación.
- Cobro **por empresa (NIT)**, no por sede.

## Fase actual: flujo manual con links de Bold
1. Admin aprueba el PCD → notificación Telegram "enviar enlace de pago Bold".
2. Jaime envía el link de pago (Bold) por correo/WhatsApp al PCD.
3. Confirmado el pago en el panel de Bold → el admin pulsa **Activar membresía**
   en el expediente (o **Otorgar tokens** con nota del pago).
4. Cancelaciones: botón **Cancelar membresía** (corta acceso de inmediato:
   el trigger `verificar_acceso_*` consulta la BD en cada operación).

## Fase futura: integración automática
- **Webhook** `POST /api/webhooks/bold` (stub 501 ya desplegado, contrato estable):
  Bold notifica `SALE_APPROVED` / `SALE_REJECTED`; se verifica la firma HMAC
  con `BOLD_WEBHOOK_SECRET` y, según metadata del link (usuario + producto):
  - producto `suscripcion` → insertar/renovar fila en `membresias`.
  - producto `tokens_N` → llamar `otorgar_tokens(usuario, N, 'compra', referencia_pago)`.
- Ejecutar SIEMPRE con `service_role` (solo dentro del route handler del webhook).
- Idempotencia: `token_movimientos.referencia` = id de transacción Bold; si ya
  existe, ignorar el evento duplicado.
- Variables: `BOLD_SECRET_KEY` (API), `BOLD_WEBHOOK_SECRET` (firma).

## Servicios tokenizables (backlog priorizado — se activan con tráfico)
1. Destacar oferta (arriba del listado + badge).
2. Alerta premium instantánea (WhatsApp/Telegram, condiciones finas).
3. Oferta urgente (notifica a todos los PCD compatibles al publicar).
4. Republicación automática N días (monetiza la expiración de medianoche).
5. (Luego) Datos: histórico de tasas cerradas en la plataforma.

Todos consumen `consumir_tokens(cantidad, concepto, referencia)` — ya desplegada,
atómica y con validación de saldo. No requieren más infraestructura de billetera.
```

- [ ] **Step 2: Stub del webhook**

`src/app/api/webhooks/bold/route.ts`:

```ts
import { NextResponse } from 'next/server'

// Contrato estable — ver docs/arquitectura-pagos-bold.md
// Se activará al configurar la cuenta Bold (BOLD_WEBHOOK_SECRET + service_role).
export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Webhook de Bold aún no configurado' },
    { status: 501 }
  )
}
```

- [ ] **Step 3: `.env.example`** — agregar al final:

```
# Bold (pagos: suscripción y paquetes de tokens) — solo servidor
BOLD_SECRET_KEY=
BOLD_WEBHOOK_SECRET=
```

- [ ] **Step 4: Build + commit** `feat: arquitectura de pagos Bold — documento y stub del webhook`.

---

### Task M6: Documentación del proyecto

**Files:**
- Modify: `README.md`
- Modify: `docs/decisiones-fase-1.md`

- [ ] **Step 1:** En `README.md`, actualizar la sección de reglas/roadmap: donde describa tiers Plus/Premium y cuotas, reemplazar por: *"Modelo comercial (2026-07-14): suscripción única `estandar` (acceso total, sin cuotas diarias) + billetera de tokens para servicios de atención (destacar, alertas premium, urgente, republicación — se activan en fase de crecimiento). Cobro por empresa (NIT) vía Bold."* Marcar Fase 2 y Fase 2.5 en el roadmap como completadas cuando corresponda.

- [ ] **Step 2:** En `docs/decisiones-fase-1.md`, agregar al final una sección `## Actualización 2026-07-14 — cambio de modelo comercial` con 3 líneas: se abandonan los tiers Plus/Premium y las cuotas diarias (decisión estratégica: monetizar atención, no actividad); las reglas de cuota de la Fase 1 quedan reemplazadas por la migration `0003_modelo_comercial.sql`; ver `docs/arquitectura-pagos-bold.md`.

- [ ] **Step 3: Commit** `docs: modelo comercial actualizado — suscripción única + tokens`.

---

### Task M7: Verificación final y despliegue a Preview

- [ ] **Step 1:** `npm test && npm run lint && npm run build` → 23 tests PASS, lint limpio, build con las 12 rutas (11 existentes + `/api/webhooks/bold`).
- [ ] **Step 2:** `git push` (rama `fase-2-kyc`) → Vercel genera el Preview.
- [ ] **Step 3:** Checklist manual para Jaime en el Preview (requiere la migration 0003 ya corrida):
  1. Dashboard de un PCD aprobado → se ven las cards "Membresía: Inactiva" y "Tokens: 0".
  2. Admin → expediente del PCD aprobado → sección "Gestión comercial" → **Activar membresía** → el PCD ve "Activa".
  3. Otorgar 50 tokens con nota → el saldo aparece en ambos lados y el movimiento en la lista.
  4. Cancelar membresía → el PCD vuelve a ver "Inactiva".
  5. Telegram: aprobar un PCD nuevo dispara el aviso "➡️ Enviar enlace de pago Bold".
- [ ] **Step 4:** El merge a `master` queda pendiente del E2E completo de TODO el branch (Fase 2 + 2.5), como estaba acordado.

---

## Fuera de alcance (NO implementar ahora)

- Integración real de Bold (API/webhook activo) → cuando Jaime tenga la cuenta.
- Los 5 servicios tokenizables → fase de crecimiento (la función `consumir_tokens` ya queda lista).
- Sedes múltiples por empresa → Fase 3 (marketplace).
- Precio de la suscripción y de los packs de tokens → decisión comercial de Jaime, no bloquea nada.
- Expiración automática de membresías (`estado='vencida'` vía cron) → se agrega cuando existan membresías con `fecha_fin` real (hoy se crean sin vencimiento).

## Riesgos y notas para el ejecutor

1. **Orden:** la migration 0003 (M1) debe correrla Jaime ANTES de probar M3/M4 en Preview — el código compila sin ella, pero las consultas a `token_saldos` devolverían error en runtime.
2. **`Insert: never` en tipos de tokens:** es intencional — obliga a usar `supabase.rpc(...)`; si TypeScript se queja en algún sitio, el error está en el código que intenta escribir directo, no en el tipo.
3. Seguir el patrón wrapper-void para `<form action>` (ya establecido) y `render` en vez de `asChild` (Base UI).
4. `maybeSingle()` (no `single()`) para membresía/saldo — la ausencia de fila es un estado normal, no un error.
5. Terminología: revisar el copy nuevo contra las reglas de oro (PCD, plataforma no ejecuta transacciones, Seguridad y Confianza).
