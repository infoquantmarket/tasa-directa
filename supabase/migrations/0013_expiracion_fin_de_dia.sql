-- =============================================================================
-- TASA DIRECTA · Expiración a fin de día (reemplaza las 24h individuales)
--
-- Decisión de Jaime: en un marketplace de divisas, una oferta "viva" por más
-- de un día genera malos entendidos (tasa desactualizada). Todas las ofertas
-- —incluidas las que ya están en negociación— vencen a las 11:59:59 p.m.
-- hora Colombia del día en que se publicaron (o del día en que entraron en
-- negociación, si eso extendió su expira_en). Si se publica tarde (ej. 11:58
-- p.m.), vive pocos minutos — aceptado a propósito, sin caso especial.
-- Idempotente.
-- =============================================================================

-- 1. Helper: fin del día actual en hora Colombia, como timestamptz -------------
create or replace function public.fin_del_dia_colombia()
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'America/Bogota')
          + interval '1 day' - interval '1 second') at time zone 'America/Bogota';
$$;

-- 2. Nueva oferta: expira al fin del día de hoy, no en +24h --------------------
alter table public.ofertas
  alter column expira_en set default public.fin_del_dia_colombia();

-- 3. Republicar / "no se concretó": misma regla (antes +24h) -------------------
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
    set estado = 'activa', expira_en = public.fin_del_dia_colombia(), updated_at = now()
  where id = p_oferta_id;

  update public.intenciones set estado = 'cerrada', updated_at = now()
  where oferta_id = p_oferta_id and estado in ('enviada','vista','aceptada');
end;
$$;

-- 4. Tope de ofertas: 'en_negociacion' también deja de contar si ya venció -----
--    (antes solo 'activa' se comparaba contra expira_en).
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

  select count(*) into v_activas
  from public.ofertas
  where usuario_id = new.usuario_id
    and expira_en > now()
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

-- 5. Cron: expira 'activa' Y 'en_negociacion' vencidas, cerrando sus intenciones
--    Cada 15 min (no cada hora) porque ahora muchas ofertas comparten el mismo
--    instante de vencimiento (medianoche) y conviene mayor precisión ahí.
do $$
begin
  perform cron.unschedule('expirar-ofertas-por-hora');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('expirar-ofertas-fin-de-dia');
exception when others then null;
end $$;

select cron.schedule(
  'expirar-ofertas-fin-de-dia',
  '*/15 * * * *',
  $cron$
    with vencidas as (
      update public.ofertas
         set estado = 'expirada', updated_at = now()
       where estado in ('activa','en_negociacion') and expira_en <= now()
       returning id
    )
    update public.intenciones
       set estado = 'cerrada', updated_at = now()
     where oferta_id in (select id from vencidas)
       and estado in ('enviada','vista','aceptada');
  $cron$
);
