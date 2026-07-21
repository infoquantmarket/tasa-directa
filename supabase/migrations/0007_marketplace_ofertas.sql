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

  -- Serializa inserciones concurrentes del mismo usuario para que el conteo
  -- de abajo sea preciso (un SELECT count(*) no se puede bloquear con FOR
  -- UPDATE). El lock se libera automáticamente al terminar la transacción.
  perform pg_advisory_xact_lock(hashtext(new.usuario_id::text));

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

-- verificar_acceso_intencion: redefinida (viene de 0003) para que el chequeo de
-- estado='activa' no pueda ser sorteado por dos intenciones concurrentes sobre
-- la misma oferta — se bloquea la fila de la oferta con FOR UPDATE, así la
-- segunda transacción espera a que la primera confirme (y el trigger
-- trg_iniciar_negociacion ya haya puesto estado='en_negociacion') antes de leerla.
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
  from public.ofertas where id = new.oferta_id for update;

  if v_owner = new.usuario_id then
    raise exception 'No puede realizar una intención sobre su propia publicación.'
      using errcode = 'check_violation';
  end if;
  if v_estado is distinct from 'activa' then
    raise exception 'Esta oferta ya está en negociación con otro interesado o no está activa.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
-- El trigger trg_acceso_intencion ya existe (creado en 0003) y apunta a esta
-- función; el `create or replace` de arriba basta, no hace falta recrear el trigger.

-- Nota: si una negociación queda en 'en_negociacion' y ninguna de las partes
-- la completa o la cierra, no hay expiración automática para ese estado (v1
-- acepta esta limitación); el admin puede forzar el cierre eliminando la
-- oferta desde el panel de Operaciones, igual que ya toleramos sesiones de
-- verificación Didit huérfanas.
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
  from public.ofertas where id = p_oferta_id for update;

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
    update public.intenciones
      set estado = 'cerrada', updated_at = now()
    where estado in ('enviada','vista')
      and oferta_id in (
        select id from public.ofertas
        where usuario_id = new.usuario_id
          and estado in ('activa','en_negociacion')
      );

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

-- 8. Restringe qué puede escribir el dueño de la oferta directamente en
--    intenciones.estado (antes permitía cualquier valor) — ahora que el ciclo
--    de negociación depende de mantener esto sincronizado con ofertas.estado,
--    solo se permite marcar vista/cerrada; el resto pasa por las funciones
--    completar_oferta()/cerrar_negociacion_sin_acuerdo().
drop policy if exists "intencion: dueño oferta gestiona" on public.intenciones;
create policy "intencion: dueño oferta gestiona" on public.intenciones
  for update to authenticated
  using (
    exists (select 1 from public.ofertas o
             where o.id = oferta_id and o.usuario_id = auth.uid())
    or public.es_admin()
  )
  with check (estado in ('vista','cerrada'));

-- 9. Refuerza el paywall del mercado a nivel de RLS (antes solo lo aplicaba la
--    página /ofertas en el cliente, lo cual no bloquea una llamada directa al
--    API de Supabase desde un usuario sin aprobación o sin membresía activa).
--    Además, quien respondió con una intención sigue viendo la oferta aunque
--    el trigger iniciar_negociacion() ya la haya sacado de estado='activa'
--    (y aunque luego se complete/expire/elimine) — si no, /ofertas/mis-intenciones
--    pierde la fila apenas el usuario responde, y no puede usar el botón
--    "No se realizó la negociación".
drop policy if exists "oferta: mercado activo" on public.ofertas;
create policy "oferta: mercado activo" on public.ofertas
  for select to authenticated
  using (
    (estado = 'activa' and public.es_aprobado() and public.tiene_membresia_activa())
    or usuario_id = auth.uid()
    or public.es_admin()
    or exists (
      select 1 from public.intenciones i
      where i.oferta_id = ofertas.id and i.usuario_id = auth.uid()
    )
  );

-- 10. Cron: expiración por oferta (24h) en vez de medianoche global ----------------
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
