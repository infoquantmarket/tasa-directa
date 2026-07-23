-- =============================================================================
-- TASA DIRECTA · Vinculación de Telegram por PCD (Opción A)
-- Un bot de Telegram no puede escribir por número de teléfono: solo a un
-- chat_id, y solo después de que la persona le dio "Start". Por eso cada PCD
-- vincula su Telegram una vez vía deep-link `t.me/<bot>?start=<token>`; el
-- webhook (/api/webhooks/telegram) recibe ese token y guarda su chat_id.
-- Idempotente.
-- =============================================================================

alter table public.perfiles_usuarios
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_link_token uuid not null default gen_random_uuid();

-- El token va en un deep-link visible solo para el propio usuario en su
-- dashboard; único para que el webhook lo resuelva a un único perfil.
create unique index if not exists uniq_perfiles_telegram_token
  on public.perfiles_usuarios (telegram_link_token);
