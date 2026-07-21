-- =============================================================================
-- TASA DIRECTA · Verificación de identidad del representante legal (Didit)
-- Idempotente.
-- =============================================================================

create table if not exists public.validaciones_identidad (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles_usuarios(id) on delete cascade,
  proveedor  text not null default 'didit',
  session_id text not null,
  estado     text not null default 'Not Started'
    check (estado in (
      'Not Started', 'In Progress', 'Approved', 'Declined', 'In Review',
      'Abandoned', 'Expired', 'Kyc Expired', 'Resubmitted', 'Awaiting User'
    )),
  decision   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_validaciones_identidad_usuario
  on public.validaciones_identidad(usuario_id, created_at desc);

create unique index if not exists uniq_validaciones_identidad_session
  on public.validaciones_identidad(session_id);

drop trigger if exists trg_upd_validaciones_identidad on public.validaciones_identidad;
create trigger trg_upd_validaciones_identidad
  before update on public.validaciones_identidad
  for each row execute function public.set_updated_at();

alter table public.validaciones_identidad enable row level security;

drop policy if exists "validaciones_identidad: leer propias" on public.validaciones_identidad;
create policy "validaciones_identidad: leer propias" on public.validaciones_identidad
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "validaciones_identidad: registrar propias" on public.validaciones_identidad;
create policy "validaciones_identidad: registrar propias" on public.validaciones_identidad
  for insert to authenticated with check (usuario_id = auth.uid());
-- No hay policy de update para el cliente autenticado: solo el webhook,
-- corriendo con service_role (que sortea RLS), puede cambiar estado/decision
-- después de creada la fila.
