-- =============================================================================
-- TASA DIRECTA · Amplía el catálogo de monedas soportadas en ofertas
-- de las 8 originales a las 25 que Jaime confirmó que se van a manejar.
-- Idempotente.
-- =============================================================================

alter table public.ofertas drop constraint if exists ofertas_moneda_check;
alter table public.ofertas
  add constraint ofertas_moneda_check
  check (moneda in (
    'USD','EUR','MXN','CAD',
    'CRC','NOK','SEK','AUD','NZD','AWG','ANG','CHF','GBP','TRY','PEN',
    'ARS','BOB','CLP','DOP','UYU','GTQ','BRL','INR','JPY','CNY'
  ));
