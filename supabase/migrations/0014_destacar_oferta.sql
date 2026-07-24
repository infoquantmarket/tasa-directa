-- =============================================================================
-- TASA DIRECTA · Destacar oferta (1 token) — servicio de tokens #1
--
-- Al crear la oferta o después de publicada, el dueño puede "destacarla":
-- consume 1 token (concepto 'destacar_oferta', ya existía en el catálogo desde
-- la Fase 2.5) y la oferta pasa a mostrarse en la sección "Destacadas" del
-- tablero, siempre arriba del resto. Cuenta contra el mismo tope de 5 ofertas
-- activas (no es un cupo aparte) — Jaime prevé más adelante vender cupos
-- adicionales con tokens, y destacar debe seguir contando ahí cuando eso pase.
-- Idempotente.
-- =============================================================================

alter table public.ofertas
  add column if not exists destacada boolean not null default false;

-- destacar_oferta: valida dueño + estado, cobra el token, marca destacada.
-- security definer porque consumir_tokens ya opera sobre auth.uid() del
-- llamador — aquí solo se agrega la validación de que la oferta sea suya y
-- siga vigente antes de cobrar.
create or replace function public.destacar_oferta(p_oferta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dueno  uuid;
  v_estado text;
  v_expira timestamptz;
begin
  select usuario_id, estado, expira_en into v_dueno, v_estado, v_expira
  from public.ofertas where id = p_oferta_id for update;

  if v_dueno is null then
    raise exception 'Oferta no encontrada.' using errcode = 'check_violation';
  end if;
  if v_dueno <> auth.uid() then
    raise exception 'Solo el dueño de la oferta puede destacarla.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_estado not in ('activa','en_negociacion') or v_expira <= now() then
    raise exception 'Solo se pueden destacar ofertas vigentes.'
      using errcode = 'check_violation';
  end if;

  perform public.consumir_tokens(1, 'destacar_oferta', p_oferta_id);

  update public.ofertas set destacada = true, updated_at = now()
  where id = p_oferta_id;
end;
$$;
