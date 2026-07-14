# Arquitectura — Pagos con Bold (suscripción + paquetes de tokens)

## Modelo comercial (decisión 2026-07-14)
- **Suscripción única** tipo `estandar`: acceso total al mercado, sin cuotas.
- **Tokens prepagados** para servicios de atención (destacar, alertas premium,
  urgente, republicación). Regla de marca: nunca vender información
  privilegiada — solo visibilidad y velocidad de notificación.
- Cobro **por empresa (NIT)**, no por sede.

## Fase actual: flujo manual con links de Bold
1. Admin aprueba el PCD → notificación Telegram "enviar enlace de pago Bold".
2. Jaime envía el link de pago (Bold) por correo/WhatsApp al PCD.
3. Confirmado el pago en el panel de Bold → el admin pulsa **Activar membresía**
   en el expediente (o **Otorgar tokens** con nota del pago).
4. Cancelaciones: botón **Cancelar membresía** (corta acceso de inmediato:
   el trigger `verificar_acceso_*` consulta la BD en cada operación).

## Fase futura: integración automática
- **Webhook** `POST /api/webhooks/bold` (stub 501 ya desplegado, contrato estable):
  Bold notifica `SALE_APPROVED` / `SALE_REJECTED`; se verifica la firma HMAC
  con `BOLD_WEBHOOK_SECRET` y, según metadata del link (usuario + producto):
  - producto `suscripcion` → insertar/renovar fila en `membresias`.
  - producto `tokens_N` → llamar `otorgar_tokens(usuario, N, 'compra', referencia_pago)`.
- Ejecutar SIEMPRE con `service_role` (solo dentro del route handler del webhook).
- Idempotencia: `token_movimientos.referencia` = id de transacción Bold; si ya
  existe, ignorar el evento duplicado.
- Variables: `BOLD_SECRET_KEY` (API), `BOLD_WEBHOOK_SECRET` (firma).

## Servicios tokenizables (backlog priorizado — se activan con tráfico)
1. Destacar oferta (arriba del listado + badge).
2. Alerta premium instantánea (WhatsApp/Telegram, condiciones finas).
3. Oferta urgente (notifica a todos los PCD compatibles al publicar).
4. Republicación automática N días (monetiza la expiración de medianoche).
5. (Luego) Datos: histórico de tasas cerradas en la plataforma.

Todos consumen `consumir_tokens(cantidad, concepto, referencia)` — ya desplegada,
atómica y con validación de saldo. No requieren más infraestructura de billetera.
