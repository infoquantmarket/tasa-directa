-- =============================================================================
-- TASA DIRECTA · Telegram: múltiples personas vinculadas por empresa (hasta 3)
-- Reemplaza perfiles_usuarios.telegram_chat_id (1 chat por empresa) por la
-- tabla telegram_vinculaciones (1 a muchos). telegram_link_token NO cambia —
-- sigue siendo un solo QR/enlace por empresa, ahora lo puede usar más de una
-- persona. Idempotente.
-- =============================================================================

-- 1. Tabla telegram_vinculaciones ------------------------------------------------
create table if not exists public.telegram_vinculaciones (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfiles_usuarios(id),
  chat_id        text not null,
  nombre_mostrar text not null,
  created_at     timestamptz not null default now(),
  unique (usuario_id, chat_id)
);

alter table public.telegram_vinculaciones enable row level security;

drop policy if exists "telegram_vinculaciones: propio lee" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: propio lee" on public.telegram_vinculaciones
  for select to authenticated using (usuario_id = auth.uid());

drop policy if exists "telegram_vinculaciones: admin lee todo" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: admin lee todo" on public.telegram_vinculaciones
  for select to authenticated using (public.es_admin());

drop policy if exists "telegram_vinculaciones: propio elimina" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: propio elimina" on public.telegram_vinculaciones
  for delete to authenticated using (usuario_id = auth.uid());

drop policy if exists "telegram_vinculaciones: admin elimina" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: admin elimina" on public.telegram_vinculaciones
  for delete to authenticated using (public.es_admin());

-- Sin insert directo desde el cliente autenticado normal: solo el webhook
-- (cliente de servicio, que no pasa por RLS) escribe aquí.
drop policy if exists "telegram_vinculaciones: sin insert directo" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: sin insert directo" on public.telegram_vinculaciones
  for insert to authenticated with check (false);

-- 2. Tope de 3 chats distintos por empresa, en la base de datos ------------------
--    Excluye el propio chat_id del conteo: si alguien YA vinculado vuelve a
--    darle "Start" (reconfirmación), no debe bloquearlo el tope.
create or replace function public.verificar_tope_telegram()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_otros integer;
begin
  select count(*) into v_otros
  from public.telegram_vinculaciones
  where usuario_id = new.usuario_id and chat_id <> new.chat_id;

  if v_otros >= 3 then
    raise exception 'Ya tiene el máximo de 3 personas vinculadas por Telegram. Desvincule a alguien para agregar otra.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tope_telegram on public.telegram_vinculaciones;
create trigger trg_tope_telegram
  before insert on public.telegram_vinculaciones
  for each row execute function public.verificar_tope_telegram();

-- 3. Backfill desde la columna vieja ----------------------------------------------
insert into public.telegram_vinculaciones (usuario_id, chat_id, nombre_mostrar)
select id, telegram_chat_id, 'Vinculación existente'
from public.perfiles_usuarios
where telegram_chat_id is not null
on conflict (usuario_id, chat_id) do nothing;

-- 4. Elimina la columna vieja (ya migrada) ----------------------------------------
alter table public.perfiles_usuarios drop column if exists telegram_chat_id;
