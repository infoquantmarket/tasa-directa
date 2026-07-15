-- =============================================================================
-- TASA DIRECTA · Fase 2.6 · Onboarding: perfil de empresa + contrato
-- Decisión 2026-07-15: cuenta mínima → perfil completo (post-login) → contrato.
-- Idempotente.
-- =============================================================================

-- 1. razon_social pasa a nullable: ahora se llena en /vinculacion, no en el registro
alter table public.perfiles_usuarios alter column razon_social drop not null;

-- 2. Columnas nuevas del perfil de empresa
alter table public.perfiles_usuarios
  add column if not exists tipo_sociedad    text,
  add column if not exists direccion        text,
  add column if not exists sitio_web         text,
  add column if not exists rep_nombre        text,
  add column if not exists rep_tipo_doc      text,
  add column if not exists rep_num_doc       text,
  add column if not exists rep_correo        text,
  add column if not exists rep_celular       text,
  add column if not exists contacto_nombre   text,
  add column if not exists contacto_cargo    text,
  add column if not exists contacto_celular  text,
  add column if not exists contacto_correo   text,
  add column if not exists perfil_completo   boolean not null default false;

-- 3. Documento OPCIONAL de composición accionaria (no bloquea aprobación)
alter table public.documentos_kyc drop constraint if exists documentos_kyc_tipo_documento_check;
alter table public.documentos_kyc
  add constraint documentos_kyc_tipo_documento_check
  check (tipo_documento in ('rut','camara_comercio','resolucion_dian','composicion_accionaria'));

-- 4. Registro mínimo: el trigger solo crea id + correo (sin datos de empresa)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles_usuarios (id, correo)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5. Aceptaciones (contrato de servicios + tratamiento de datos), ledger inmutable
create table if not exists public.aceptaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles_usuarios(id) on delete cascade,
  documento  text not null check (documento in ('contrato_servicios','tratamiento_datos')),
  version    text not null,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_aceptaciones_usuario
  on public.aceptaciones(usuario_id, documento);

alter table public.aceptaciones enable row level security;

drop policy if exists "aceptaciones: leer propias" on public.aceptaciones;
create policy "aceptaciones: leer propias" on public.aceptaciones
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "aceptaciones: registrar propias" on public.aceptaciones;
create policy "aceptaciones: registrar propias" on public.aceptaciones
  for insert to authenticated with check (usuario_id = auth.uid());
-- No update/delete: el ledger es inmutable.
