# Arquitectura — Validación de identidad externa (diseño Fase 2, integración futura)

## Objetivo
Complementar la revisión manual de cumplimiento con un proveedor externo de
verificación de identidad/antecedentes (p. ej. Truora, Metamap, RegCheck),
sin acoplar la plataforma a un proveedor específico.

## Diseño: patrón adaptador + webhook

1. **Disparo** — al aprobar los 3 documentos, el panel admin podrá (opt-in)
   solicitar una verificación externa: `POST /api/kyc/validacion-externa`.
2. **Adaptador por proveedor** — interfaz única en `src/lib/kyc/proveedor.ts`:

   ```ts
   interface ProveedorValidacion {
     iniciarVerificacion(input: {
       usuarioId: string
       nit: string
       razonSocial: string
     }): Promise<{ referenciaExterna: string }>
   }
   ```

3. **Callback asíncrono** — el proveedor notifica el resultado a
   `POST /api/webhooks/validacion-identidad` (ruta reservada), firmado con
   secreto compartido (`VALIDACION_WEBHOOK_SECRET`).
4. **Persistencia** — tabla futura `validaciones_externas`
   (usuario_id, proveedor, referencia_externa, resultado, payload jsonb,
   created_at). Migration cuando se contrate el proveedor.
5. **Decisión** — el resultado NO aprueba automáticamente: se muestra como
   señal adicional en el expediente; la decisión final sigue siendo humana
   (principio "Seguridad y Confianza" = cumplimiento con criterio).

## Contrato del endpoint (estable desde hoy)

`POST /api/kyc/validacion-externa`
- Auth: sesión admin (verificada server-side).
- Body: `{ "usuarioId": "uuid" }`
- 202: `{ "ok": true, "referenciaExterna": "..." }`
- 501 mientras no haya proveedor contratado (estado actual).
