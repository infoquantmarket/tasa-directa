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
