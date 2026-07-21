# Marketplace de ofertas (Fase 3 + 4) — Design

**Fecha:** 2026-07-21
**Estado:** Aprobado por Jaime, listo para plan de implementación.

## Contexto

`supabase/migrations/0001_esquema_inicial.sql` (Fase 1) y
`0003_modelo_comercial.sql` (Fase 2.5) ya construyeron la mayor parte del
backend de este marketplace — tablas `ofertas`/`intenciones`, RLS,
triggers de validación de acceso, una vista `perfiles_publicos` pensada
exactamente para revelar contacto en "Realizar Oferta", y un cron de
expiración. Nunca se construyó la capa de UI encima (por eso Fase 3/4
seguían pendientes en el roadmap). Este spec **reutiliza esa base y solo
ajusta lo que cambió** por decisión de Jaime: expiración por oferta (24h)
en vez de medianoche global, y un tope de 5 activas en vez de sin límite.

## Objetivo

Que un PCD aprobado, con membresía activa, pueda publicar su necesidad de
compra/venta de divisas, que otros PCD la vean en un tablero y respondan con
una intención (revelando datos de contacto para negociar fuera de la
plataforma — la plataforma solo conecta, no ejecuta transacciones), y que el
admin tenga visibilidad total de la actividad.

## Decisiones confirmadas por Jaime

1. **Alcance:** marketplace completo en esta fase — publicar, tablero,
   intenciones ("Realizar Oferta" → "Validar Oferta"), y panel admin de
   operaciones. No se decompone en sub-fases separadas.
2. **Gating de publicar:** requiere membresía `estandar` activa. Reemplaza
   `limite_diario()` por un tope de **máximo 5 ofertas activas
   simultáneas** por PCD (no un contador diario) — es una salvaguarda
   contra spam, no una palanca de monetización (eso lo cubren los tokens).
3. **Al llegar al tope:** se **bloquea** publicar una 6ta oferta con un
   mensaje claro, hasta que una expire o el PCD elimine una manualmente. No
   se auto-reemplaza la más vieja.
4. **Expiración:** cada oferta vence **24 horas después de publicarse**
   (no a medianoche Colombia como en el diseño original de Fase 1 — ese
   esquema imputaba cupos por día calendario, que ya no aplica). Se muestra
   un disclaimer al publicar y un "stamp" de cuenta regresiva en cada
   tarjeta, visible tanto para quien publica como para quien la ve.
5. **Sedes:** **texto libre**, no una tabla estructurada de sedes por
   empresa (decisión revertida durante el brainstorming — se descartó la
   opción de una tabla dedicada por simplicidad). El PCD escribe la sede al
   publicar, más un campo de notas libres (ej. "están en billetes de 20").
6. **Historial visible:** en "Mis ofertas" solo se muestran las ofertas
   activas + las últimas 5 expiradas/eliminadas (por fecha). El resto queda
   en la base de datos (nunca se borra físicamente) pero no se renderiza,
   para no llenar la pantalla de ofertas sin efecto.
7. **Al recibir una intención:** se revelan al dueño de la oferta los datos
   de contacto de quien respondió (empresa, representante, celular/correo).
   Notificación por **correo (Resend)** + marcador "nueva" en plataforma
   (la propia fila de `intenciones` con `estado='enviada'` cumple ese rol;
   no hace falta una tabla de notificaciones aparte). Notificación por
   Telegram/WhatsApp se deja fuera de alcance — pertenece a la Fase 5
   ("Notificaciones y DevOps") del roadmap, no a esta fase.
8. **Panel admin:** visibilidad de todas las ofertas e intenciones activas
   de la plataforma + botón para eliminar (borrado lógico) cualquier
   oferta.

## Arquitectura

### Lo que ya existe y se reutiliza tal cual (sin tocar)

- **RLS de `ofertas`**: `"oferta: mercado activo"` (select: activas de
  cualquiera + propias en cualquier estado + admin), `"oferta: crear
  propia"`, `"oferta: editar propia"`, `"oferta: admin modera"` (`for all`
  — el admin ya puede eliminar/editar cualquier oferta a nivel de RLS).
- **RLS de `intenciones`**: `"intencion: partes involucradas"` (select:
  quien responde + dueño de la oferta + admin), `"intencion: crear
  propia"`, `"intencion: dueño oferta gestiona"` (update de `estado`).
- **Triggers de negocio**: `verificar_acceso_oferta()` (aprobado +
  membresía activa al insertar oferta), `verificar_acceso_intencion()`
  (aprobado + membresía activa + no sobre oferta propia + oferta debe
  estar `activa`) — ambos ya sin cuotas, actualizados en la 2.5.
  `proteger_campos_oferta()` (solo `cantidad`/`precio_cop` editables tras
  crear; el resto, incluida `moneda`, inmutable).
- **`public.tiene_membresia_activa()`** — ya existe (migration 0003), no
  hace falta un helper nuevo.
- **Vista `public.perfiles_publicos`** — ya expone `razon_social`,
  `nombre_comercial`, `sede`, `ciudad`, `telefono`, `whatsapp`, `correo` de
  PCD aprobados, otorgada a `authenticated`. Es exactamente lo que necesita
  el modal "Realizar Oferta" para revelar el contacto — se consulta desde
  ahí, no hace falta ampliarla.

### Cambios a `ofertas` (migration nueva)

- Se agrega `notas` (`text`, opcional) — texto libre tipo "están en
  billetes de 20".
- Se agrega `expira_en` (`timestamptz not null`, calculado como
  `created_at + interval '24 hours'` al insertar — vía `default` o
  trigger, no lo decide el cliente).
- Se elimina la columna `fecha_oferta` (imputaba cupos por día calendario;
  ya no aplica). Esto obliga a actualizar `proteger_campos_oferta()`:
  quitar la línea que compara `new.fecha_oferta is distinct from
  old.fecha_oferta`, y **agregar** `notas` y `expira_en` a la lista de
  campos inmutables (si no, quedarían editables por accidente vía la
  policy `"oferta: editar propia"`, que solo valida dueño, no campos).
- **Se amplía `verificar_acceso_oferta()`** (no se reemplaza, se hace
  `create or replace`) agregando el conteo de activas: si
  `(select count(*) from ofertas where usuario_id = new.usuario_id and
  estado = 'activa') >= 5`, rechaza con un mensaje claro.
- **Se reemplaza el cron** `expirar-ofertas-medianoche` (que marcaba TODAS
  las activas cada medianoche) por uno que corre **cada hora** y solo
  expira las que ya cumplieron su propio `expira_en`:
  `update ofertas set estado='expirada' where estado='activa' and
  expira_en <= now()`.

### `intenciones` — sin cambios de estructura ni de RLS/triggers

Se usa tal cual: `oferta_id`, `usuario_id` (quien responde), `tipo`
(`aceptar_precio`/`solicitar_contacto`), `comentarios`, `estado`
(`enviada`/`vista`/`cerrada`). `estado='enviada'` es la señal de
"nueva/no vista" que alimenta el badge en plataforma — ya se puede
actualizar a `vista`/`cerrada` con la policy existente.

### Rutas y componentes

1. **`/ofertas`** — tablero del marketplace: lista las ofertas
   `estado='activa'` de **otras** empresas (requiere sesión + PCD aprobado
   + membresía activa; si no cumple, mensaje explicando qué falta en vez
   del tablero). Cada tarjeta: empresa, sede, operación, moneda, cantidad,
   precio, condiciones, notas, cuenta regresiva hasta `expira_en`, botón
   "Realizar Oferta" (abre modal: tipo + comentarios opcionales).

2. **`/ofertas/mis-ofertas`** — ofertas propias: activas (con contador
   X/5 y cuenta regresiva) + últimas 5 expiradas/eliminadas. Botón
   "Publicar oferta" (modal con disclaimer de expiración de 24h, deshabilitado
   si ya tiene 5 activas o no tiene membresía activa, con el mensaje
   correspondiente en cada caso). Cada oferta activa muestra sus
   intenciones recibidas (contacto revelado, comentario, botón para marcar
   como vista/cerrada) con badge de "nuevas". El badge de "nuevas" vive
   **solo dentro de esta página** — no hay contador global en el header ni
   en `/dashboard` en esta fase.

3. **`src/lib/notificaciones/intencion.ts`** (nuevo) — envía el correo
   (Resend) al dueño de la oferta cuando se crea una intención, reutilizando
   el mismo remitente/dominio ya configurado (`noreply@tasadirecta.com`).

4. **Admin — `/admin` (nueva sección "Operaciones")** — tabla de todas las
   ofertas activas (con sus intenciones) de la plataforma, con botón
   eliminar (borrado lógico) por oferta. La policy `"oferta: admin modera"`
   ya permite esto a nivel de base de datos; aquí solo falta la UI. Sin
   campo de motivo (a diferencia del rechazo de documentos KYC) — es una
   acción simple, sin necesidad de justificación registrada en v1.

5. **Validación (zod, TDD)** — `src/lib/validation/oferta.ts`
   (`ofertaSchema`) e `src/lib/validation/intencion.ts` (`intencionSchema`),
   siguiendo el mismo patrón de los schemas existentes del proyecto.

## Manejo de errores

- Publicar sin membresía activa → rechazado por `verificar_acceso_oferta()`
  (ya existente); la Server Action traduce el error a un mensaje dirigiendo
  a activar membresía.
- Publicar con 5 activas → rechazado por la misma función (ampliada); la
  Server Action traduce a "espere a que expire una oferta o elimine una".
- Responder la propia oferta / oferta no activa → ya rechazado por
  `verificar_acceso_intencion()` (existente, sin cambios).
- Membresía se desactiva mientras hay ofertas activas → esas ofertas
  siguen su curso normal de 24h (el trigger solo corre al insertar); solo
  se bloquea publicar nuevas mientras la membresía esté inactiva.
- Dos PCD responden la misma oferta → ambas intenciones quedan visibles
  para el dueño, sin bloqueo de "primero en llegar".

## Fuera de alcance

- Notificación por Telegram/WhatsApp (Fase 5).
- Tabla estructurada de sedes por empresa (se descartó durante el diseño).
- Moderación automática de contenido de las ofertas/notas.
- Historial completo visible en UI de ofertas expiradas/eliminadas más allá
  de las últimas 5 (sigue existiendo en base de datos, solo no se muestra).
- Edición de `moneda`, `operacion`, `sede` o `notas` tras publicar — el
  diseño original de Fase 1 solo permite editar `cantidad`/`precio_cop`, se
  mantiene igual.
