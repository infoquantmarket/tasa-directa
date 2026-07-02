-- =============================================================================
-- TASA DIRECTA · Marketplace B2B para Profesionales de Compra y Venta de Divisas
-- =============================================================================
-- Fase 1 · Esquema de datos, RLS estricto, cuotas por membresía y expiración
--          automática de ofertas.
--
-- Motor            : PostgreSQL (Supabase)
-- Zona de negocio  : America/Bogota (UTC-5, Colombia no aplica horario de verano)
-- Terminología     : los usuarios son "Profesionales de Compra y Venta de
--                    Divisas (PCD)" autorizados por la DIAN. NUNCA "casas de cambio".
-- Rol de plataforma: marketplace B2B. NO ejecuta ni liquida transacciones.
--
-- Este script es idempotente: se puede pegar varias veces en el SQL Editor de
-- Supabase durante el desarrollo sin romperse.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensiones
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_cron;    -- Cron interno de Postgres (expiración diaria)
--   Nota: si pg_cron no está disponible por permisos, actívalo en
--   Supabase → Database → Extensions, o usa el Cron de Vercel (ver sección 9).


-- -----------------------------------------------------------------------------
-- 1. Funciones utilitarias
-- -----------------------------------------------------------------------------

-- Fecha actual en horario de Colombia. Base de TODAS las cuotas diarias.
create or replace function public.fecha_colombia()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- Refresca updated_at en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- (Las funciones es_admin / es_aprobado / limite_diario están en la sección 2.6,
--  después de las tablas: las funciones SQL validan su cuerpo al crearse y
--  requieren que las relaciones ya existan.)


-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

-- 2.1 Perfiles de usuario (extiende auth.users) ------------------------------
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
  motivo_estado    text,               -- razón de rechazo/suspensión (visible para el usuario)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2.2 Documentos KYC (RUT, Cámara de Comercio, Resolución DIAN) ---------------
create table if not exists public.documentos_kyc (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfiles_usuarios(id) on delete cascade,
  tipo_documento text not null
                 check (tipo_documento in ('rut','camara_comercio','resolucion_dian')),
  storage_path   text not null,        -- ruta en el bucket privado 'kyc-documentos'
  nombre_archivo text,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','aprobado','rechazado')),
  notas_revision text,
  revisado_por   uuid references public.perfiles_usuarios(id),
  revisado_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (usuario_id, tipo_documento) -- un documento vigente por tipo
);

-- 2.3 Membresías (plus / premium) --------------------------------------------
create table if not exists public.membresias (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles_usuarios(id) on delete cascade,
  tipo         text not null check (tipo in ('plus','premium')),
  estado       text not null default 'activa' check (estado in ('activa','vencida','cancelada')),
  fecha_inicio date not null default public.fecha_colombia(),
  fecha_fin    date,                   -- null = sin vencimiento definido
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Solo una membresía ACTIVA por usuario a la vez.
create unique index if not exists uniq_membresia_activa
  on public.membresias (usuario_id)
  where estado = 'activa';

-- 2.4 Ofertas / Publicaciones de necesidad -----------------------------------
create table if not exists public.ofertas (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles_usuarios(id) on delete cascade,
  -- Datos denormalizados para la tarjeta e histórico (INMUTABLES tras crear):
  empresa      text not null,          -- ej. 'Nutifinanzas'
  sede         text,                   -- ej. 'Oviedo'
  operacion    text check (operacion in ('compra','venta')), -- dirección de la necesidad
  -- Núcleo de la oferta:
  moneda       text not null
               check (moneda in ('USD','EUR','GBP','CAD','MXN','CHF','AUD','JPY')), -- INMUTABLE
  cantidad     numeric(18,2) not null check (cantidad > 0),    -- EDITABLE (monto)
  precio_cop   numeric(18,2) not null check (precio_cop > 0),  -- EDITABLE (precio unitario en COP)
  condiciones  text[] not null default '{}'::text[]
               check (condiciones <@ array['efectivo','transferencia','para_recoger','en_oficina']::text[]),
  estado       text not null default 'activa'
               check (estado in ('activa','expirada','eliminada')),
  fecha_oferta date not null default public.fecha_colombia(),  -- día al que imputa la cuota
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2.5 Intenciones ("Realizar Oferta" → "Validar Oferta") ---------------------
create table if not exists public.intenciones (
  id              uuid primary key default gen_random_uuid(),
  oferta_id       uuid not null references public.ofertas(id) on delete cascade,
  usuario_id      uuid not null references public.perfiles_usuarios(id) on delete cascade, -- quien responde
  tipo            text not null check (tipo in ('aceptar_precio','solicitar_contacto')),
  comentarios     text,               -- "Comentarios adicionales" del modal
  estado          text not null default 'enviada' check (estado in ('enviada','vista','cerrada')),
  fecha_intencion date not null default public.fecha_colombia(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 2.6 Funciones que dependen de las tablas
-- -----------------------------------------------------------------------------
-- Se definen aquí (no en la sección 1) porque las funciones en `language sql`
-- validan su cuerpo al crearse y requieren que las tablas ya existan.

-- ¿El usuario es administrador de cumplimiento?
-- SECURITY DEFINER para evitar recursión de RLS al consultarse dentro de políticas.
create or replace function public.es_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles_usuarios
    where id = uid and rol = 'admin'
  );
$$;

-- ¿El usuario está aprobado (KYC completo)?
create or replace function public.es_aprobado(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles_usuarios
    where id = uid and estado = 'aprobado'
  );
$$;

-- Límite diario de publicaciones/intenciones según la membresía activa.
--   premium = 3 · plus = 1 · sin membresía activa = 0
create or replace function public.limite_diario(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
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


-- -----------------------------------------------------------------------------
-- 3. Índices
-- -----------------------------------------------------------------------------
create index if not exists idx_ofertas_estado     on public.ofertas(estado);
create index if not exists idx_ofertas_usuario    on public.ofertas(usuario_id);
create index if not exists idx_ofertas_fecha      on public.ofertas(fecha_oferta);
create index if not exists idx_docs_usuario       on public.documentos_kyc(usuario_id);
create index if not exists idx_intenciones_oferta on public.intenciones(oferta_id);
create index if not exists idx_intenciones_user   on public.intenciones(usuario_id);


-- -----------------------------------------------------------------------------
-- 4. Triggers de integridad y reglas de negocio
-- -----------------------------------------------------------------------------

-- 4.1 updated_at en todas las tablas
drop trigger if exists trg_upd_perfiles    on public.perfiles_usuarios;
create trigger trg_upd_perfiles    before update on public.perfiles_usuarios for each row execute function public.set_updated_at();
drop trigger if exists trg_upd_docs        on public.documentos_kyc;
create trigger trg_upd_docs        before update on public.documentos_kyc    for each row execute function public.set_updated_at();
drop trigger if exists trg_upd_membresias  on public.membresias;
create trigger trg_upd_membresias  before update on public.membresias        for each row execute function public.set_updated_at();
drop trigger if exists trg_upd_ofertas     on public.ofertas;
create trigger trg_upd_ofertas     before update on public.ofertas           for each row execute function public.set_updated_at();
drop trigger if exists trg_upd_intenciones on public.intenciones;
create trigger trg_upd_intenciones before update on public.intenciones       for each row execute function public.set_updated_at();

-- 4.2 Alta automática de perfil al registrarse en Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles_usuarios
    (id, razon_social, correo, telefono, whatsapp, sede, ciudad, nit)
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

-- 4.3 Un usuario no puede auto-cambiarse rol ni estado de aprobación
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.es_admin() then
    return new;   -- admin / backend con service key pueden todo
  end if;
  if new.rol is distinct from old.rol
  or new.estado is distinct from old.estado then
    raise exception 'No puede modificar su propio rol ni estado de aprobación.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_perfil on public.perfiles_usuarios;
create trigger trg_proteger_perfil
  before update on public.perfiles_usuarios
  for each row execute function public.proteger_perfil();

-- 4.4 Cuota diaria de PUBLICACIONES según membresía (Plus=1 / Premium=3)
--     Cuenta TODAS las ofertas creadas hoy, incluidas las eliminadas:
--     eliminar una publicación NO libera el cupo del día.
create or replace function public.verificar_cuota_oferta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception 'Cuota diaria de publicaciones alcanzada (% de %). Revise su membresía activa.',
      v_usadas, v_limite using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cuota_oferta on public.ofertas;
create trigger trg_cuota_oferta
  before insert on public.ofertas
  for each row execute function public.verificar_cuota_oferta();

-- 4.5 Inmutabilidad: solo se pueden editar CANTIDAD y PRECIO (+ estado de sistema)
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
  or new.fecha_oferta is distinct from old.fecha_oferta
  or new.created_at   is distinct from old.created_at then
    raise exception 'Solo se pueden editar cantidad y precio. La moneda y el resto de campos son inmutables.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_oferta on public.ofertas;
create trigger trg_proteger_oferta
  before update on public.ofertas
  for each row execute function public.proteger_campos_oferta();

-- 4.6 Cuota diaria de INTENCIONES + validaciones (no sobre oferta propia, oferta activa)
create or replace function public.verificar_cuota_intencion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists trg_cuota_intencion on public.intenciones;
create trigger trg_cuota_intencion
  before insert on public.intenciones
  for each row execute function public.verificar_cuota_intencion();


-- -----------------------------------------------------------------------------
-- 5. Vista pública de contacto (para el modal "Realizar Oferta")
-- -----------------------------------------------------------------------------
-- Expone SOLO datos de contacto de PCD aprobados. La tabla base queda blindada.
create or replace view public.perfiles_publicos as
select id, razon_social, nombre_comercial, sede, ciudad, telefono, whatsapp, correo
from public.perfiles_usuarios
where estado = 'aprobado';

grant select on public.perfiles_publicos to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.perfiles_usuarios enable row level security;
alter table public.documentos_kyc    enable row level security;
alter table public.membresias        enable row level security;
alter table public.ofertas           enable row level security;
alter table public.intenciones       enable row level security;

-- 6.1 perfiles_usuarios ------------------------------------------------------
drop policy if exists "perfil: leer propio"     on public.perfiles_usuarios;
create policy "perfil: leer propio" on public.perfiles_usuarios
  for select to authenticated using (id = auth.uid());

drop policy if exists "perfil: admin lee todo"  on public.perfiles_usuarios;
create policy "perfil: admin lee todo" on public.perfiles_usuarios
  for select to authenticated using (public.es_admin());

drop policy if exists "perfil: crear propio"    on public.perfiles_usuarios;
create policy "perfil: crear propio" on public.perfiles_usuarios
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "perfil: editar propio"   on public.perfiles_usuarios;
create policy "perfil: editar propio" on public.perfiles_usuarios
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
  -- (rol/estado quedan blindados por el trigger proteger_perfil)

drop policy if exists "perfil: admin edita todo" on public.perfiles_usuarios;
create policy "perfil: admin edita todo" on public.perfiles_usuarios
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- 6.2 documentos_kyc ---------------------------------------------------------
drop policy if exists "kyc: leer propios"   on public.documentos_kyc;
create policy "kyc: leer propios" on public.documentos_kyc
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "kyc: subir propios"  on public.documentos_kyc;
create policy "kyc: subir propios" on public.documentos_kyc
  for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists "kyc: editar propios pendientes" on public.documentos_kyc;
create policy "kyc: editar propios pendientes" on public.documentos_kyc
  for update to authenticated
  using (usuario_id = auth.uid() and estado = 'pendiente')
  with check (usuario_id = auth.uid());

drop policy if exists "kyc: admin revisa"   on public.documentos_kyc;
create policy "kyc: admin revisa" on public.documentos_kyc
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "kyc: borrar propios pendientes" on public.documentos_kyc;
create policy "kyc: borrar propios pendientes" on public.documentos_kyc
  for delete to authenticated using (usuario_id = auth.uid() and estado = 'pendiente');

-- 6.3 membresias (asignadas por admin/backend; el usuario solo lee) -----------
drop policy if exists "membresia: leer propia" on public.membresias;
create policy "membresia: leer propia" on public.membresias
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "membresia: admin gestiona" on public.membresias;
create policy "membresia: admin gestiona" on public.membresias
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- 6.4 ofertas ----------------------------------------------------------------
drop policy if exists "oferta: mercado activo" on public.ofertas;
create policy "oferta: mercado activo" on public.ofertas
  for select to authenticated
  using (estado = 'activa' or usuario_id = auth.uid() or public.es_admin());

drop policy if exists "oferta: crear propia" on public.ofertas;
create policy "oferta: crear propia" on public.ofertas
  for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists "oferta: editar propia" on public.ofertas;
create policy "oferta: editar propia" on public.ofertas
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
  -- Eliminar = UPDATE estado='eliminada' (borrado lógico → conserva la cuota del día)

drop policy if exists "oferta: admin modera" on public.ofertas;
create policy "oferta: admin modera" on public.ofertas
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- 6.5 intenciones ------------------------------------------------------------
drop policy if exists "intencion: partes involucradas" on public.intenciones;
create policy "intencion: partes involucradas" on public.intenciones
  for select to authenticated
  using (
    usuario_id = auth.uid()                                             -- quien la envió
    or exists (select 1 from public.ofertas o
                where o.id = oferta_id and o.usuario_id = auth.uid())   -- dueño de la oferta
    or public.es_admin()
  );

drop policy if exists "intencion: crear propia" on public.intenciones;
create policy "intencion: crear propia" on public.intenciones
  for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists "intencion: dueño oferta gestiona" on public.intenciones;
create policy "intencion: dueño oferta gestiona" on public.intenciones
  for update to authenticated
  using (
    exists (select 1 from public.ofertas o
             where o.id = oferta_id and o.usuario_id = auth.uid())
    or public.es_admin()
  )
  with check (true);


-- -----------------------------------------------------------------------------
-- 7. Storage · Bucket privado para documentos KYC
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kyc-documentos', 'kyc-documentos', false)
on conflict (id) do nothing;

-- Convención de ruta: {auth.uid()}/{tipo_documento}-{timestamp}.pdf
drop policy if exists "storage kyc: subir propios" on storage.objects;
create policy "storage kyc: subir propios" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc-documentos'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "storage kyc: leer propios" on storage.objects;
create policy "storage kyc: leer propios" on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc-documentos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

drop policy if exists "storage kyc: actualizar propios" on storage.objects;
create policy "storage kyc: actualizar propios" on storage.objects
  for update to authenticated
  using (bucket_id = 'kyc-documentos'
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "storage kyc: borrar propios" on storage.objects;
create policy "storage kyc: borrar propios" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kyc-documentos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));


-- -----------------------------------------------------------------------------
-- 8. Cron · Expiración de ofertas a las 00:00 hora Colombia
-- -----------------------------------------------------------------------------
-- 00:00 America/Bogota = 05:00 UTC (sin horario de verano).
do $$
begin
  perform cron.unschedule('expirar-ofertas-medianoche');
exception when others then null;   -- aún no existe: se ignora
end $$;

select cron.schedule(
  'expirar-ofertas-medianoche',
  '0 5 * * *',
  $cron$
    update public.ofertas
       set estado = 'expirada', updated_at = now()
     where estado = 'activa';
  $cron$
);
--   Alternativa Vercel Cron (si no se usa pg_cron): un route handler
--   /api/cron/expirar-ofertas con service_role ejecutando el mismo UPDATE,
--   agendado en vercel.ts → crons: [{ path:'/api/cron/expirar-ofertas', schedule:'0 5 * * *' }]


-- -----------------------------------------------------------------------------
-- 9. Bootstrap del administrador de cumplimiento (ejecutar UNA vez)
-- -----------------------------------------------------------------------------
-- 1) Crea el usuario admin desde Supabase → Authentication → Add user.
-- 2) Promuévelo:
--    update public.perfiles_usuarios
--       set rol = 'admin', estado = 'aprobado'
--     where correo = 'admin@tasadirecta.com';
-- =============================================================================
