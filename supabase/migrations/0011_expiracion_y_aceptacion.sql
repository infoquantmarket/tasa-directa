-- =============================================================================
-- TASA DIRECTA · Expiración precisa + estado 'aceptada' para intenciones
--
-- Cambios:
-- 1) verificar_acceso_oferta ahora considera "activa" solo si expira_en > now(),
--    porque el cron corre cada hora y en la ventana entre vencimiento y limpieza
--    las ofertas seguían contando contra el tope de 5 y bloqueaban publicar.
-- 2) Nuevo estado 'aceptada' en intenciones — el dueño de la oferta puede
--    aceptar la intención de quien respondió; eso completa la oferta y (desde
--    la app) notifica por correo al que ofertó.
-- 3) Se ajustan completar_oferta y cerrar_negociacion_sin_acuerdo para que
--    reconozcan el nuevo estado.
-- Idempotente.
-- =============================================================================

-- 1. Estado 'aceptada' en intenciones -------------------------------------------
alter table public.intenciones drop constraint if exists intenciones_estado_check;
alter table public.intenciones
  add constraint intenciones_estado_check
  check (estado in ('enviada','vista','aceptada','cerrada'));

-- 2. verificar_acceso_oferta — cuenta solo las realmente vigentes --------------
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

  perform pg_advisory_xact_lock(hashtext(new.usuario_id::text));

  -- Vigente = activa Y aún no vencida, o en negociación.
  select count(*) into v_activas
  from public.ofertas
  where usuario_id = new.usuario_id
    and (
      (estado = 'activa' and expira_en > now())
      or estado = 'en_negociacion'
    );

  if v_activas >= 5 then
    raise exception 'Ya tiene 5 ofertas activas. Espere a que una expire, se complete o elimine una para publicar otra.'
      using errcode = 'check_violation';
  elsif v_activas >= 2 then
    perform public.consumir_tokens(1, 'oferta_adicional', new.id);
  end if;

  return new;
end;
$$;

-- 3. completar_oferta — también cierra intenciones 'aceptada' ------------------
create or replace function public.completar_oferta(p_oferta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dueno   uuid;
  v_estado  text;
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

  update public.ofertas set estado = 'completada', updated_at = now()
  where id = p_oferta_id;

  update public.intenciones set estado = 'cerrada', updated_at = now()
  where oferta_id = p_oferta_id and estado in ('enviada','vista','aceptada');
end;
$$;

-- 4. cerrar_negociacion_sin_acuerdo — mismo ajuste -----------------------------
create or replace function public.cerrar_negociacion_sin_acuerdo(p_oferta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dueno        uuid;
  v_estado       text;
  v_puede_cerrar boolean;
begin
  select usuario_id, estado into v_dueno, v_estado
  from public.ofertas where id = p_oferta_id for update;

  if v_estado is distinct from 'en_negociacion' then
    raise exception 'Esta oferta no está en negociación.'
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.intenciones
    where oferta_id = p_oferta_id
      and estado in ('enviada','vista','aceptada')
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
  where oferta_id = p_oferta_id and estado in ('enviada','vista','aceptada');
end;
$$;

-- 5. Nuevo RPC aceptar_intencion — marca la intención como aceptada y
--    completa la oferta en una sola transacción. La notificación por correo
--    la dispara la app (server action).
create or replace function public.aceptar_intencion(p_intencion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_oferta_id uuid;
  v_dueno     uuid;
  v_estado_of text;
  v_estado_in text;
begin
  select i.oferta_id, i.estado, o.usuario_id, o.estado
    into v_oferta_id, v_estado_in, v_dueno, v_estado_of
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

  update public.ofertas set estado = 'completada', updated_at = now()
  where id = v_oferta_id;

  -- Cerrar el resto de intenciones sobre esa oferta (por si hubiera colgadas).
  update public.intenciones set estado = 'cerrada', updated_at = now()
  where oferta_id = v_oferta_id
    and id <> p_intencion_id
    and estado in ('enviada','vista');
end;
$$;
