-- =============================================================================
-- TASA DIRECTA · Corrige recursión infinita en RLS entre ofertas <-> intenciones
--
-- La política "oferta: mercado activo" (agregada en 0007 para que quien
-- respondió no perdiera visibilidad de su propia oferta en negociación)
-- consulta intenciones con un EXISTS correlacionado. La política de
-- intenciones ("intencion: partes involucradas", desde 0001) ya consultaba
-- ofertas de la misma forma. Postgres necesita expandir ambas políticas para
-- calificar la consulta con RLS, y como se referencian mutuamente, entra en
-- recursión infinita (42P17) — CUALQUIER select sobre ofertas fallaba,
-- silenciado en la app porque las páginas solo miraban `data`, nunca `error`.
--
-- Fix: envolver la verificación en una función security definer. El rol que
-- corre las migraciones es dueño de ambas tablas y por default el dueño de
-- una tabla no está sujeto a su propio RLS (a menos que se use FORCE ROW
-- LEVEL SECURITY, que no usamos) — el mismo mecanismo que ya permite a
-- es_admin()/es_aprobado()/tiene_membresia_activa() consultar tablas con RLS
-- sin recursión. Al llamar la función en vez del EXISTS inline, Postgres ya
-- no necesita expandir la política de intenciones dentro de la de ofertas,
-- así que el ciclo desaparece.
-- Idempotente.
-- =============================================================================

create or replace function public.tiene_intencion_propia_en(p_oferta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.intenciones i
    where i.oferta_id = p_oferta_id and i.usuario_id = auth.uid()
  );
$$;

drop policy if exists "oferta: mercado activo" on public.ofertas;
create policy "oferta: mercado activo" on public.ofertas
  for select to authenticated
  using (
    (estado = 'activa' and public.es_aprobado() and public.tiene_membresia_activa())
    or usuario_id = auth.uid()
    or public.es_admin()
    or public.tiene_intencion_propia_en(id)
  );
