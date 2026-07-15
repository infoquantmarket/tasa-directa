-- =============================================================================
-- TASA DIRECTA · Documentos legales · Click-wrap de los 7
-- Amplía el catálogo de documentos aceptables y guarda snapshot de identidad
-- para que cada aceptación sea prueba autosuficiente. Idempotente.
-- =============================================================================

-- 1. El CHECK inline de 0004 se llama aceptaciones_documento_check (auto-nombrado).
alter table public.aceptaciones drop constraint if exists aceptaciones_documento_check;
alter table public.aceptaciones
  add constraint aceptaciones_documento_check
  check (documento in (
    'contrato_servicios',
    'tratamiento_datos',
    'politica_tratamiento',
    'terminos_condiciones',
    'aviso_privacidad',
    'politica_kyc',
    'politica_reembolsos'
  ));

-- 2. Snapshot de identidad al momento de aceptar (perfil es editable; esto no).
alter table public.aceptaciones
  add column if not exists razon_social text,
  add column if not exists nit          text,
  add column if not exists rep_nombre   text,
  add column if not exists rep_num_doc  text;
