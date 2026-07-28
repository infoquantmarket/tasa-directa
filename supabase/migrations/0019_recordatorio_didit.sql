-- =============================================================================
-- TASA DIRECTA · Recordatorio de verificación de identidad (Didit) +
-- alerta "listo para aprobar"
-- Segundo punto de abandono del embudo: documentos ya aprobados, pero el
-- representante legal nunca completó (o abandonó) la verificación externa
-- de identidad. Mismo patrón que 0018 (recordatorio de documentos), con su
-- propio contador — más un botón manual en el expediente admin, que
-- comparte el mismo contador que el cron.
-- Idempotente.
-- =============================================================================

-- 1. Columnas de seguimiento --------------------------------------------------
alter table public.perfiles_usuarios
  add column if not exists recordatorios_didit_enviados smallint not null default 0,
  add column if not exists recordatorio_didit_ultimo_envio timestamptz;

-- 2. Candidatos a recordatorio de identidad ------------------------------------
--    Solo service_role (el cron) — igual que usuarios_para_recordatorio_kyc().
create or replace function public.usuarios_para_recordatorio_didit()
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
  select p.id, p.correo, p.razon_social, (p.recordatorios_didit_enviados + 1)::smallint
  from public.perfiles_usuarios p
  where p.estado = 'pendiente'
    and p.rol = 'usuario'
    and p.recordatorios_didit_enviados < 3
    and (
      p.recordatorio_didit_ultimo_envio is null
      or p.recordatorio_didit_ultimo_envio <= now() - interval '3 days'
    )
    and (
      select count(distinct d.tipo_documento)
      from public.documentos_kyc d
      where d.usuario_id = p.id
        and d.tipo_documento in ('rut', 'camara_comercio', 'resolucion_dian')
        and d.estado = 'aprobado'
    ) = 3
    and coalesce(
      (
        select v.estado
        from public.validaciones_identidad v
        where v.usuario_id = p.id
        order by v.created_at desc
        limit 1
      ),
      'Not Started'
    ) in ('Not Started', 'Abandoned', 'Expired', 'Kyc Expired');
end;
$$;

-- 3. Registrar el envío ---------------------------------------------------------
--    A diferencia de registrar_recordatorio_kyc(), este SÍ lo puede llamar un
--    admin autenticado además del cron — lo usa también el botón manual del
--    expediente (mismo contador, mismo tope de 3, sin importar la vía).
--    Mismo patrón que proteger_perfil() (0001_esquema_inicial.sql).
create or replace function public.registrar_recordatorio_didit(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.es_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  update public.perfiles_usuarios
     set recordatorios_didit_enviados = recordatorios_didit_enviados + 1,
         recordatorio_didit_ultimo_envio = now()
   where id = p_usuario_id;
end;
$$;
