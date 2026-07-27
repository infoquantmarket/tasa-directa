-- =============================================================================
-- TASA DIRECTA · Recordatorio automático de documentación KYC
-- Usuarios que se registraron pero nunca subieron ningún documento reciben
-- hasta 3 correos (cada 3 días, empezando 24h después del registro)
-- recordándoles completar /vinculacion. Disparado por Vercel Cron diario.
-- Idempotente.
-- =============================================================================

-- 1. Columnas de seguimiento en perfiles_usuarios --------------------------------
alter table public.perfiles_usuarios
  add column if not exists recordatorios_kyc_enviados smallint not null default 0,
  add column if not exists recordatorio_kyc_ultimo_envio timestamptz;

-- 2. Candidatos a recordatorio ----------------------------------------------------
--    A diferencia de las demás funciones security definer del proyecto (pensadas
--    para que cualquier usuario autenticado las llame, limitando qué puede hacer
--    cada quien con auth.uid()), esta expone correo y razón social de TODAS las
--    empresas — nunca debe poder llamarla un usuario normal. Mismo patrón de
--    chequeo que proteger_perfil() (0001_esquema_inicial.sql): solo service_role.
create or replace function public.usuarios_para_recordatorio_kyc()
returns table (
  usuario_id          uuid,
  correo              text,
  razon_social        text,
  numero_recordatorio smallint
)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id, p.correo, p.razon_social, (p.recordatorios_kyc_enviados + 1)::smallint
  from public.perfiles_usuarios p
  where p.estado = 'pendiente'
    and p.rol = 'usuario'
    and p.created_at <= now() - interval '24 hours'
    and p.recordatorios_kyc_enviados < 3
    and (
      p.recordatorio_kyc_ultimo_envio is null
      or p.recordatorio_kyc_ultimo_envio <= now() - interval '3 days'
    )
    and not exists (
      select 1 from public.documentos_kyc d where d.usuario_id = p.id
    );
end;
$$;

-- 3. Registrar el envío -------------------------------------------------------------
create or replace function public.registrar_recordatorio_kyc(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  update public.perfiles_usuarios
     set recordatorios_kyc_enviados = recordatorios_kyc_enviados + 1,
         recordatorio_kyc_ultimo_envio = now()
   where id = p_usuario_id;
end;
$$;
