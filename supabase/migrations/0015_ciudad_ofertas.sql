-- =============================================================================
-- TASA DIRECTA · Ciudad en ofertas — filtro por zona en el tablero
--
-- El tablero mostraba el mercado completo del país sin distinguir ciudad.
-- Se agrega `ciudad` a `ofertas` (denormalizada desde el perfil del PCD al
-- publicar, igual que `empresa`/`sede`) para poder filtrar por área
-- metropolitana en el tablero. Se backfillean las ofertas existentes con la
-- ciudad actual del perfil de su dueño. Idempotente.
-- =============================================================================

alter table public.ofertas
  add column if not exists ciudad text;

update public.ofertas o
set ciudad = p.ciudad
from public.perfiles_usuarios p
where p.id = o.usuario_id
  and o.ciudad is null
  and p.ciudad is not null;
