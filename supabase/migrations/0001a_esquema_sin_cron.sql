-- =============================================================================
-- TASA DIRECTA · Parte 1 de 2 · Esquema completo SIN pg_cron
-- Pega esto primero. La parte del cron va aparte en 0001b_cron.sql
-- =============================================================================

-- -----------------------------------------------------------------------
-- 0. Extensión base
-- -----------------------------------------------------------------------
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------
-- 1. Funciones utilitarias (sin dependencias de tablas)
-- -----------------------------------------------------------------------
create or replace function public.fecha_colombia()
returns date language sql stable as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------

-- 2.1 Perfiles (extiende auth.users)
create table if not exists public.perfiles_usuarios (
  id               uuid primary key references auth.users(id) on delete cascade,
  tipo_usuario     text not null default 'PCD' check (tipo_usuario in ('PCD')),
  razon_social     text not null,
  nombre_comercial text,
  nit              text,
  sede             text,
  ciudad           text,
  telefono         text,
  whatsapp         text,
  correo           text not null,
  rol              text not null default 'usuario' check (rol in ('usuario','admin')),
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','aprobado','rechazado','suspendido')),
  motivo_estado    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2.2 Documentos KYC
create table if not exists public.documentos_kyc (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfiles_usuarios(id) on delete cascade,
  tipo_documento text not null
                 check (tipo_documento in ('rut','camara_comercio','resolucion_dian')),
  storage_path   text not null,
  nombre_archivo text,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','aprobado','rechazado')),
  notas_revision text,
  revisado_por   uuid references public.perfiles_usuarios(id),
  revisado_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (usuario_id, tipo_documento)
);

-- 2.3 Membresías
create table if not exists public.membresias (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles_usuarios(id) on delete cascade,
  tipo         text not null check (tipo in ('plus','premium')),
  estado       text not null default 'activa' check (estado in ('activa','vencida','cancelada')),
  fecha_inicio date not null default public.fecha_colombia(),
  fecha_fin    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists uniq_membresia_activa
  on public.membresias (usuario_id)
  where estado = 'activa';

-- 2.4 Ofertas
create table if not exists public.ofertas (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles_usuarios(id) on delete cascade,
  empresa      text not null,
  sede         text,
  operacion    text check (operacion in ('compra','venta')),
  moneda       text not null
               check (moneda in ('USD','EUR','GBP','CAD','MXN','CHF','AUD','JPY')),
  cantidad     numeric(18,2) not null check (cantidad > 0),
  precio_cop   numeric(18,2) not null check (precio_cop > 0),
  condiciones  text[] not null default '{}'::text[]
               check (condiciones <@ array['efectivo','transferencia','para_recoger','en_oficina']::text[]),
  estado       text not null default 'activa'
               check (estado in ('activa','expirada','eliminada')),
  fecha_oferta date not null default public.fecha_colombia(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2.5 Intenciones
create table if not exists public.intenciones (
  id              uuid primary key default gen_random_uuid(),
  oferta_id       uuid not null references public.ofertas(id) on delete cascade,
  usuario_id      uuid not null references public.perfiles_usuarios(id) on delete cascade,
  tipo            text not null check (tipo in ('aceptar_precio','solicitar_contacto')),
  comentarios     text,
  estado          text not null default 'enviada' check (estado in ('enviada','vista','cerrada')),
  fecha_intencion date not null default public.fecha_colombia(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------
-- 2.6 Funciones que leen las tablas (van DESPUÉS de crear las tablas)
-- -----------------------------------------------------------------------
create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles_usuarios where id = uid and rol = 'admin');
$$;

create or replace function public.es_aprobado(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles_usuarios where id = uid and estado = 'aprobado');
$$;

create or replace function public.limite_diario(uid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case m.tipo when 'premium' then 3 when 'plus' then 1 else 0 end
       from public.membresias m
      where m.usuario_id = uid
        and m.estado = 'activa'
        and m.fecha_inicio <= public.fecha_colombia()
        and (m.fecha_fin is null or m.fecha_fin >= public.fecha_colombia())
      order by case m.tipo when 'premium' then 2 else 1 end desc
      limit 1),
    0
  );
$$;

-- -----------------------------------------------------------------------
-- 3. Índices
-- -----------------------------------------------------------------------
create index if not exists idx_ofertas_estado     on public.ofertas(estado);
create index if not exists idx_ofertas_usuario    on public.ofertas(usuario_id);
create index if not exists idx_ofertas_fecha      on public.ofertas(fecha_oferta);
create index if not exists idx_docs_usuario       on public.documentos_kyc(usuario_id);
create index if not exists idx_intenciones_oferta on public.intenciones(oferta_id);
create index if not exists idx_intenciones_user   on public.intenciones(usuario_id);

-- -----------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------

-- 4.1 updated_at
create or replace trigger trg_upd_perfiles    before update on public.perfiles_usuarios for each row execute function public.set_updated_at();
create or replace trigger trg_upd_docs        before update on public.documentos_kyc    for each row execute function public.set_updated_at();
create or replace trigger trg_upd_membresias  before update on public.membresias        for each row execute function public.set_updated_at();
create or replace trigger trg_upd_ofertas     before update on public.ofertas           for each row execute function public.set_updated_at();
create or replace trigger trg_upd_intenciones before update on public.intenciones       for each row execute function public.set_updated_at();

-- 4.2 Crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles_usuarios (id, razon_social, correo, telefono, whatsapp, sede, ciudad, nit)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'razon_social', 'Registro pendiente'),
    new.email,
    new.raw_user_meta_data->>'telefono',
    new.raw_user_meta_data->>'whatsapp',
    new.raw_user_meta_data->>'sede',
    new.raw_user_meta_data->>'ciudad',
    new.raw_user_meta_data->>'nit'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4.3 Proteger rol y estado del perfil
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.es_admin() then
    return new;
  end if;
  if new.rol is distinct from old.rol or new.estado is distinct from old.estado then
    raise exception 'No puede modificar su propio rol ni estado de aprobación.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace trigger trg_proteger_perfil
  before update on public.perfiles_usuarios
  for each row execute function public.proteger_perfil();

-- 4.4 Cuota diaria de publicaciones
create or replace function public.verificar_cuota_oferta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_usadas integer;
begin
  if not public.es_aprobado(new.usuario_id) then
    raise exception 'El usuario no está aprobado para publicar ofertas.'
      using errcode = 'check_violation';
  end if;
  v_limite := public.limite_diario(new.usuario_id);
  select count(*) into v_usadas
  from public.ofertas
  where usuario_id = new.usuario_id
    and (created_at at time zone 'America/Bogota')::date = public.fecha_colombia();
  if v_usadas >= v_limite then
    raise exception 'Cuota diaria de publicaciones alcanzada (% de %). Revise su membresía.',
      v_usadas, v_limite using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger trg_cuota_oferta
  before insert on public.ofertas
  for each row execute function public.verificar_cuota_oferta();

-- 4.5 Campos inmutables de la oferta (solo cantidad y precio son editables)
create or replace function public.proteger_campos_oferta()
returns trigger language plpgsql as $$
begin
  if new.moneda      is distinct from old.moneda
  or new.empresa     is distinct from old.empresa
  or new.sede        is distinct from old.sede
  or new.operacion   is distinct from old.operacion
  or new.condiciones is distinct from old.condiciones
  or new.usuario_id  is distinct from old.usuario_id
  or new.fecha_oferta is distinct from old.fecha_oferta then
    raise exception 'Solo cantidad y precio son editables. La moneda y demás campos son inmutables.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger trg_proteger_oferta
  before update on public.ofertas
  for each row execute function public.proteger_campos_oferta();

-- 4.6 Cuota diaria de intenciones
create or replace function public.verificar_cuota_intencion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_usadas integer;
  v_owner  uuid;
  v_estado text;
begin
  if not public.es_aprobado(new.usuario_id) then
    raise exception 'El usuario no está aprobado para realizar intenciones.'
      using errcode = 'check_violation';
  end if;
  select usuario_id, estado into v_owner, v_estado from public.ofertas where id = new.oferta_id;
  if v_owner = new.usuario_id then
    raise exception 'No puede realizar una intención sobre su propia publicación.'
      using errcode = 'check_violation';
  end if;
  if v_estado is distinct from 'activa' then
    raise exception 'Solo se pueden realizar intenciones sobre ofertas activas.'
      using errcode = 'check_violation';
  end if;
  v_limite := public.limite_diario(new.usuario_id);
  select count(*) into v_usadas
  from public.intenciones
  where usuario_id = new.usuario_id
    and (created_at at time zone 'America/Bogota')::date = public.fecha_colombia();
  if v_usadas >= v_limite then
    raise exception 'Cuota diaria de intenciones alcanzada (% de %).',
      v_usadas, v_limite using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger trg_cuota_intencion
  before insert on public.intenciones
  for each row execute function public.verificar_cuota_intencion();

-- -----------------------------------------------------------------------
-- 5. Vista pública de contacto
-- -----------------------------------------------------------------------
create or replace view public.perfiles_publicos as
select id, razon_social, nombre_comercial, sede, ciudad, telefono, whatsapp, correo
from public.perfiles_usuarios
where estado = 'aprobado';

grant select on public.perfiles_publicos to authenticated;

-- -----------------------------------------------------------------------
-- 6. Row Level Security (RLS)
-- -----------------------------------------------------------------------
alter table public.perfiles_usuarios enable row level security;
alter table public.documentos_kyc    enable row level security;
alter table public.membresias        enable row level security;
alter table public.ofertas           enable row level security;
alter table public.intenciones       enable row level security;

-- perfiles_usuarios
drop policy if exists "perfil: leer propio"      on public.perfiles_usuarios;
drop policy if exists "perfil: admin lee todo"   on public.perfiles_usuarios;
drop policy if exists "perfil: crear propio"     on public.perfiles_usuarios;
drop policy if exists "perfil: editar propio"    on public.perfiles_usuarios;
drop policy if exists "perfil: admin edita todo" on public.perfiles_usuarios;
create policy "perfil: leer propio"      on public.perfiles_usuarios for select to authenticated using (id = auth.uid());
create policy "perfil: admin lee todo"   on public.perfiles_usuarios for select to authenticated using (public.es_admin());
create policy "perfil: crear propio"     on public.perfiles_usuarios for insert to authenticated with check (id = auth.uid());
create policy "perfil: editar propio"    on public.perfiles_usuarios for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "perfil: admin edita todo" on public.perfiles_usuarios for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- documentos_kyc
drop policy if exists "kyc: leer"              on public.documentos_kyc;
drop policy if exists "kyc: subir"             on public.documentos_kyc;
drop policy if exists "kyc: editar pendientes" on public.documentos_kyc;
drop policy if exists "kyc: admin revisa"      on public.documentos_kyc;
drop policy if exists "kyc: borrar pendientes" on public.documentos_kyc;
create policy "kyc: leer"              on public.documentos_kyc for select to authenticated using (usuario_id = auth.uid() or public.es_admin());
create policy "kyc: subir"             on public.documentos_kyc for insert to authenticated with check (usuario_id = auth.uid());
create policy "kyc: editar pendientes" on public.documentos_kyc for update to authenticated using (usuario_id = auth.uid() and estado = 'pendiente') with check (usuario_id = auth.uid());
create policy "kyc: admin revisa"      on public.documentos_kyc for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "kyc: borrar pendientes" on public.documentos_kyc for delete to authenticated using (usuario_id = auth.uid() and estado = 'pendiente');

-- membresias
drop policy if exists "membresia: leer propia"    on public.membresias;
drop policy if exists "membresia: admin gestiona" on public.membresias;
create policy "membresia: leer propia"    on public.membresias for select to authenticated using (usuario_id = auth.uid() or public.es_admin());
create policy "membresia: admin gestiona" on public.membresias for all    to authenticated using (public.es_admin()) with check (public.es_admin());

-- ofertas
drop policy if exists "oferta: mercado activo" on public.ofertas;
drop policy if exists "oferta: crear propia"   on public.ofertas;
drop policy if exists "oferta: editar propia"  on public.ofertas;
drop policy if exists "oferta: admin modera"   on public.ofertas;
create policy "oferta: mercado activo" on public.ofertas for select to authenticated using (estado = 'activa' or usuario_id = auth.uid() or public.es_admin());
create policy "oferta: crear propia"   on public.ofertas for insert to authenticated with check (usuario_id = auth.uid());
create policy "oferta: editar propia"  on public.ofertas for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "oferta: admin modera"   on public.ofertas for all    to authenticated using (public.es_admin()) with check (public.es_admin());

-- intenciones
drop policy if exists "intencion: partes involucradas" on public.intenciones;
drop policy if exists "intencion: crear propia"        on public.intenciones;
drop policy if exists "intencion: gestionar"           on public.intenciones;
create policy "intencion: partes involucradas" on public.intenciones for select to authenticated
  using (usuario_id = auth.uid()
         or exists (select 1 from public.ofertas o where o.id = oferta_id and o.usuario_id = auth.uid())
         or public.es_admin());
create policy "intencion: crear propia"        on public.intenciones for insert to authenticated with check (usuario_id = auth.uid());
create policy "intencion: gestionar"           on public.intenciones for update to authenticated
  using (exists (select 1 from public.ofertas o where o.id = oferta_id and o.usuario_id = auth.uid()) or public.es_admin())
  with check (true);

-- -----------------------------------------------------------------------
-- 7. Storage · Bucket privado para documentos KYC
-- -----------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kyc-documentos', 'kyc-documentos', false)
on conflict (id) do nothing;

drop policy if exists "storage kyc: subir propios"      on storage.objects;
drop policy if exists "storage kyc: leer propios"       on storage.objects;
drop policy if exists "storage kyc: actualizar propios" on storage.objects;
drop policy if exists "storage kyc: borrar propios"     on storage.objects;
create policy "storage kyc: subir propios"      on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage kyc: leer propios"       on storage.objects for select to authenticated
  using (bucket_id = 'kyc-documentos' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
create policy "storage kyc: actualizar propios" on storage.objects for update to authenticated
  using (bucket_id = 'kyc-documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage kyc: borrar propios"     on storage.objects for delete to authenticated
  using (bucket_id = 'kyc-documentos' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

-- -----------------------------------------------------------------------
-- 8. Promover usuario admin (ajusta el correo)
-- -----------------------------------------------------------------------
-- Después de crear el usuario en Authentication → Add user, corre esto:
--
-- update public.perfiles_usuarios
--    set rol = 'admin', estado = 'aprobado'
--  where correo = 'TU_CORREO_ADMIN@tasadirecta.com';
-- =============================================================================
