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
