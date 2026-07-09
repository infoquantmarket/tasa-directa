-- =============================================================================
-- TASA DIRECTA · Fase 2 · Ajustes KYC
-- 1) El PCD puede re-subir documentos RECHAZADOS (no solo pendientes),
--    pero cualquier edición suya deja el documento de vuelta en 'pendiente'
--    (imposible auto-aprobarse).
-- 2) Límites del bucket kyc-documentos: 10 MB, solo PDF/JPG/PNG.
-- Idempotente: se puede correr varias veces.
-- =============================================================================

drop policy if exists "kyc: editar pendientes" on public.documentos_kyc;
drop policy if exists "kyc: editar propios"    on public.documentos_kyc;
create policy "kyc: editar propios" on public.documentos_kyc
  for update to authenticated
  using (usuario_id = auth.uid() and estado in ('pendiente','rechazado'))
  with check (usuario_id = auth.uid() and estado = 'pendiente');

drop policy if exists "kyc: borrar pendientes" on public.documentos_kyc;
create policy "kyc: borrar pendientes" on public.documentos_kyc
  for delete to authenticated
  using (usuario_id = auth.uid() and estado in ('pendiente','rechazado'));

update storage.buckets
   set file_size_limit    = 10485760,  -- 10 MB
       allowed_mime_types = array['application/pdf','image/jpeg','image/png']
 where id = 'kyc-documentos';
