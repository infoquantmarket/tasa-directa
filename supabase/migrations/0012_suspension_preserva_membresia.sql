-- =============================================================================
-- TASA DIRECTA · Suspender un PCD preserva su membresía
--
-- Decisión de Jaime: suspender es una medida de cumplimiento/comportamiento,
-- no de facturación — si el PCD paga y está al día, suspenderlo no debe
-- hacerle perder el ciclo de membresía ya pagado. Al reactivar, si la
-- membresía seguía vigente, el PCD recupera el acceso al mercado sin tener
-- que volver a pagar.
--
-- Se extrae la lógica de "eliminar ofertas activas de un usuario" a una
-- función compartida, y se agrega un trigger en perfiles_usuarios que la
-- dispara al suspender — independiente del trigger existente en membresias
-- (que sigue existiendo para cancelaciones reales de membresía).
-- Idempotente.
-- =============================================================================

-- 1. Función compartida ---------------------------------------------------------
create or replace function public.eliminar_ofertas_activas_usuario(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.intenciones
    set estado = 'cerrada', updated_at = now()
  where estado in ('enviada','vista','aceptada')
    and oferta_id in (
      select id from public.ofertas
      where usuario_id = p_usuario_id
        and estado in ('activa','en_negociacion')
    );

  update public.ofertas
    set estado = 'eliminada', updated_at = now()
  where usuario_id = p_usuario_id
    and estado in ('activa','en_negociacion');
end;
$$;

-- 2. liberar_ofertas_por_cancelacion ahora reutiliza la función compartida ------
create or replace function public.liberar_ofertas_por_cancelacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'activa' and new.estado is distinct from 'activa' then
    perform public.eliminar_ofertas_activas_usuario(new.usuario_id);
  end if;
  return new;
end;
$$;
-- El trigger trg_liberar_ofertas_cancelacion en membresias ya existe y sigue igual.

-- 3. Nuevo trigger: suspender un perfil también elimina sus ofertas activas,
--    SIN tocar la membresía (a diferencia de cancelar membresía).
create or replace function public.liberar_ofertas_por_suspension()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'suspendido' and old.estado is distinct from 'suspendido' then
    perform public.eliminar_ofertas_activas_usuario(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_liberar_ofertas_suspension on public.perfiles_usuarios;
create trigger trg_liberar_ofertas_suspension
  after update on public.perfiles_usuarios
  for each row execute function public.liberar_ofertas_por_suspension();
