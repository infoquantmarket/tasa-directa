# Verificación de identidad del representante legal (Didit) — Design

**Fecha:** 2026-07-21
**Estado:** Aprobado por Jaime, listo para plan de implementación.

## Contexto

`docs/arquitectura-validacion-identidad.md` (Fase 2) ya diseñó un patrón
genérico de adaptador + webhook para un proveedor externo de validación de
identidad, dejando un endpoint stub `POST /api/kyc/validacion-externa`
(501). Jaime ya eligió proveedor — **Didit** (didit.me) — y tiene cuenta
creada, pendiente de configurar el workflow. Este spec concreta ese diseño
genérico específicamente para Didit, y lo dirige a un caso más específico
que el original: verificar la identidad de la **persona física** que funge
como representante legal de la empresa (no una verificación de la empresa
en sí).

## Objetivo

Antes de que un PCD pueda ser aprobado, su representante legal debe
completar una verificación de identidad (documento + prueba de vida +
comparación facial) a través de Didit, disparada desde `/vinculacion`.

## Investigación (API real de Didit, verificada contra su documentación)

- Autenticación: header `x-api-key`. Obtenido en business.didit.me → API & Webhooks.
- Crear sesión: `POST https://verification.didit.me/v3/session/` con body
  `{ workflow_id, vendor_data, callback, expected_details, contact_details }`.
  Respuesta incluye `session_id`, `session_token`, `url` (a donde se
  redirige al usuario), `status` (inicial `"Not Started"`).
- El usuario completa el flujo alojado por Didit (fuera de nuestra app).
- El resultado llega por **webhook**, NO por polling: evento `status.updated`
  con `session_id`, `status`, `decision` (cuando el estado es
  Approved/Declined/In Review/Abandoned).
- Estados posibles de sesión: `Not Started`, `In Progress`, `Approved`,
  `Declined`, `In Review`, `Abandoned`, `Expired`, `Kyc Expired`,
  `Resubmitted`, `Awaiting User`.
- Firma del webhook: header `X-Signature-V2`, HMAC-SHA256 sobre el JSON
  canónico, con el `secret_shared_key` del webhook registrado en consola.
  Rechazar si `abs(now - X-Timestamp) > 300` segundos. Comparación en
  tiempo constante.
- **Tier gratuito de Didit** ($0/mes, sin tarjeta, 500 verificaciones/mes)
  incluye el paquete completo: ID Verification + Passive Liveness + Face
  Match + Device/IP Analysis — no hay que elegir entre gratis y completo,
  son el mismo paquete.

Fuentes: [Quick Start](https://docs.didit.me/getting-started/quick-start),
[API Authentication](https://docs.didit.me/getting-started/api-authentication),
[Create Session](https://docs.didit.me/sessions-api/create-session),
[Webhooks](https://docs.didit.me/integration/webhooks),
[Pricing](https://didit.me/products/id-verification/).

## Decisiones confirmadas por Jaime

1. **Obligatoria para aprobar** — igual que los 3 documentos KYC, el PCD no
   puede pasar a `estado='aprobado'` hasta que la verificación de Didit esté
   en `Approved`. Mientras se espera, se muestra un estado `pendiente`
   visible en `/vinculacion`, sin necesidad de recargar (llega por webhook).
2. **Workflow de Didit:** ID Verification + Passive Liveness + Face Match
   (el bundle gratuito completo).
3. **Ubicación en el flujo:** dentro de `/vinculacion` (etapa 2), como un
   cuarto requisito junto a los 3 documentos — NO disparado por el admin.
   Razón: quien debe completar el flujo (foto de cédula + selfie) es el
   representante legal, no el admin; ponerlo en `/vinculacion` evita tener
   que mandarle un enlace por correo y esperar de forma asíncrona antes
   siquiera de empezar la revisión.

## Arquitectura

### Datos nuevos

Tabla `validaciones_identidad` (reemplaza la tabla "futura"
`validaciones_externas` prevista en el doc de Fase 2, ahora concretada):

```sql
create table public.validaciones_identidad (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles_usuarios(id) on delete cascade,
  proveedor    text not null default 'didit',
  session_id   text not null,
  estado       text not null default 'Not Started',
  decision     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

Un usuario puede tener múltiples filas a lo largo del tiempo (reintentos si
`Declined`/`Expired`); el estado vigente es el de la fila más reciente por
`usuario_id`. RLS: el PCD ve solo las suyas (select), el admin ve todas; el
PCD puede **insertar** su propia fila inicial (`usuario_id = auth.uid()`,
`estado='Not Started'`) al crear la sesión — eso lo hace la propia Server
Action con la sesión del usuario, no con `service_role`. Pero **ninguna
policy de `update` existe para el cliente**: solo el webhook, corriendo con
`service_role` (que sortea RLS), puede cambiar `estado`/`decision` después
de la creación. Mismo principio de "el cliente nunca reescribe el
resultado" que ya aplica en `token_saldos`/`aceptaciones`, adaptado aquí
porque a diferencia de esas tablas, aquí SÍ hace falta que el cliente cree
la fila (no solo la lea).

### Variables de entorno nuevas

- `DIDIT_API_KEY` — para crear sesiones.
- `DIDIT_WORKFLOW_ID` — el workflow configurado por Jaime en consola.
- `DIDIT_WEBHOOK_SECRET` — para verificar la firma del webhook.

### Piezas de código

1. **`src/lib/didit/cliente.ts`** — función `crearSesionVerificacion(input:
   { usuarioId, repNombre, repTipoDoc, repNumDoc, callback }):
   Promise<{ sessionId, url }>`. Llama a
   `POST https://verification.didit.me/v3/session/` con `x-api-key`,
   pasando `vendor_data: usuarioId`, `callback`, y `expected_details`
   derivado de los datos del representante ya capturados en
   `perfiles_usuarios`: `rep_nombre` se divide en el primer espacio —
   todo antes del primer espacio es `first_name`, el resto (si existe) es
   `last_name`; si no hay espacio, `last_name` queda vacío. `id_country:
   'CO'` fijo (el mercado actual es solo Colombia). `expected_document_types`
   se fija a `['id_card']` siempre — `rep_tipo_doc` puede ser CC, CE,
   Pasaporte o NIT (ver `TIPOS_DOC_REP` en `src/lib/validation/perfil.ts`),
   pero Didit espera un tipo de documento genérico de identidad, no un
   mapeo 1:1 de esos 4 valores; no se intenta traducir cada uno.

2. **Server action en `/vinculacion`** — `iniciarVerificacionIdentidad`:
   valida que `rep_nombre`/`rep_tipo_doc`/`rep_num_doc` ya estén guardados
   (si no, error pidiendo guardar el perfil primero), llama a
   `crearSesionVerificacion`, inserta una fila en `validaciones_identidad`
   con `estado='Not Started'` y el `session_id` devuelto, y redirige (o
   devuelve la `url` para que el cliente navegue) al flujo alojado de Didit.

3. **`POST /api/webhooks/didit`** (nueva ruta) — verifica `X-Signature-V2`
   con `DIDIT_WEBHOOK_SECRET` (HMAC-SHA256, comparación en tiempo
   constante, rechaza si el timestamp está a más de 300s de diferencia),
   lee el `session_id` del payload, actualiza la fila correspondiente en
   `validaciones_identidad` (`estado`, `decision`) usando `service_role`.
   Responde 200 rápido (Didit reintenta si no hay 2xx). Mismo patrón de
   seguridad que `src/app/api/webhooks/bold/route.ts`.

4. **`/vinculacion` (page + form)** — nueva card "Verificar identidad del
   representante legal": muestra el estado vigente
   (`Not Started`/sin fila → botón "Verificar identidad"; `In Progress`/
   `Not Started` con sesión creada → "Verificación en proceso"; `Approved`
   → check verde; `Declined`/`Expired` → mensaje de error + botón para
   reintentar, creando una nueva sesión). El botón se deshabilita si los
   campos del representante aún no se han guardado.

5. **`puedeAprobarUsuario`** (`src/lib/validation/kyc.ts`) — se amplía para
   recibir también el estado de `validaciones_identidad` y exigir
   `estado === 'Approved'` además de los 3 documentos.

6. **Expediente admin** (`/admin/usuarios/[id]`) — nueva fila de solo
   lectura mostrando el estado de la verificación de identidad Didit
   (fecha, estado); no hay acción manual de aprobar/rechazar sobre esto —
   la decisión la toma Didit automáticamente vía su bundle, reflejada aquí.

## Manejo de errores

- Sesión creada pero el usuario abandona el flujo de Didit sin terminar →
  queda en `Not Started`/`In Progress` indefinidamente; el PCD puede volver
  a `/vinculacion` y reintentar (crea una nueva sesión; la vieja simplemente
  queda huérfana, Didit la expira por su cuenta).
- Webhook con firma inválida → 401, no se procesa, se loguea el intento.
- Webhook para un `session_id` que no existe en nuestra tabla → 200 (para
  no hacer que Didit reintente indefinidamente) pero se ignora/loguea.
- `Declined` → se muestra al PCD como verificación rechazada, con opción de
  reintentar (nueva sesión); no bloquea permanentemente.

## Fuera de alcance

- Envío automático del enlace por correo si el representante legal es una
  persona distinta a quien llena el formulario (Didit lo soporta vía
  `contact_details.send_notification_emails`, pero v1 solo expone el enlace
  en pantalla para reenviar manualmente).
- AML screening y verificación de la empresa (KYB) — esto es solo identidad
  de la persona (representante legal).
- Reintentos automáticos o límite de intentos — v1 permite reintentar sin
  límite.
