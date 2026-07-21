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
en vez de medianoche global, un tope de 2 ofertas activas gratis (hasta 5
pagando con tokens) en vez de sin límite, un ciclo de negociación con
estados nuevos, y borrado automático de ofertas al cancelar membresía.

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
2. **Gating de publicar:** requiere membresía `estandar` activa.
   - Las primeras **2 ofertas activas simultáneas son gratis**.
   - De la **3ra a la 5ta** oferta activa simultánea, cada una **consume 1
     token** (nuevo concepto `oferta_adicional`). Si no tiene tokens
     suficientes, se bloquea con el mismo mensaje de saldo insuficiente que
     ya usan `destacar_oferta`/`alerta_premium`/etc.
   - **Tope duro: 5 activas** en total (gratis + pagadas) — más allá de
     eso se bloquea sin excepción, publicar una 6ta con un mensaje claro,
     hasta que una expire, se complete o el PCD elimine una manualmente. No
     se auto-reemplaza la más vieja.
   - Esto reemplaza a `limite_diario()` (ya retirado en la 2.5); es una
     salvaguarda contra spam y una fuente de monetización moderada para
     quienes publican mucho volumen, no una cuota fija por membresía.
3. **Expiración:** cada oferta vence **24 horas después de publicarse**
   (no a medianoche Colombia como en el diseño original de Fase 1 — ese
   esquema imputaba cupos por día calendario, que ya no aplica). Se muestra
   un disclaimer al publicar y un "stamp" de cuenta regresiva en cada
   tarjeta, visible tanto para quien publica como para quien la ve.
4. **Sedes:** **texto libre**, no una tabla estructurada de sedes por
   empresa (decisión revertida durante el brainstorming — se descartó la
   opción de una tabla dedicada por simplicidad). El PCD escribe la sede al
   publicar, más un campo de notas libres (ej. "están en billetes de 20").
5. **Historial visible:** en "Mis ofertas" solo se muestran las ofertas
   activas + las últimas 5 expiradas/eliminadas (por fecha). El resto queda
   en la base de datos (nunca se borra físicamente) pero no se renderiza,
   para no llenar la pantalla de ofertas sin efecto.
6. **Al recibir una intención:** se revelan al dueño de la oferta los datos
   de contacto de quien respondió (empresa, representante, celular/correo).
   Notificación por **correo (Resend)** + marcador "nueva" en plataforma
   (la propia fila de `intenciones` con `estado='enviada'` cumple ese rol;
   no hace falta una tabla de notificaciones aparte). Notificación por
   Telegram/WhatsApp se deja fuera de alcance — pertenece a la Fase 5
   ("Notificaciones y DevOps") del roadmap, no a esta fase.
7. **Panel admin:** visibilidad de todas las ofertas e intenciones activas
   de la plataforma + botón para eliminar (borrado lógico) cualquier
   oferta.
8. **Negociación (corrección tras revisar el spec inicial):** al llegar la
   primera intención sobre una oferta, esta pasa a un estado
   `en_negociacion` — esto bloquea automáticamente que alguien más responda
   mientras tanto (ya no aplica "quien llegue primero" libremente). Desde
   ahí:
   - El **dueño de la oferta** ve dos botones: **"Oferta completada"**
     (cierra definitivamente, el trato se concretó) o **"Republicar"** (si
     no llegaron a un acuerdo).
   - **Quien respondió** ve un botón **"No se realizó la negociación"**,
     con el mismo efecto que "Republicar" pero disparado desde su lado.
   - Ambas acciones (`Republicar` / `No se realizó la negociación`) hacen
     exactamente lo mismo: la propia oferta (misma fila, no una nueva)
     vuelve a `activa` con el reloj de 24h **reiniciado**, y la intención
     que causó la negociación se marca `cerrada`. **Es explícitamente
     gratis, sin excepción** — no consume tokens ni cuenta contra el tope
     de 2 gratis/5 máximo, precisamente porque es la misma fila (no crea
     una oferta nueva). Cobrar por esto se consideró poco ético (la
     negociación pudo fracasar sin culpa del PCD).
9. **Membresía cancelada → se eliminan sus ofertas (corrección):** al
    cancelar la membresía de un PCD (acción admin ya existente,
    `cancelarMembresia`), TODAS sus ofertas en `activa` o `en_negociacion`
    pasan automáticamente a `eliminada`. Ya no se deja que las activas
    sigan su curso — se consideró clave y fundamental que desaparezcan de
    inmediato del mercado.

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
  `created_at + interval '24 hours'` al insertar, y **reiniciado** a
  `now() + interval '24 hours'` cuando se reactiva tras una negociación
  fallida).
- Se elimina la columna `fecha_oferta` (imputaba cupos por día calendario;
  ya no aplica). Esto obliga a actualizar `proteger_campos_oferta()`:
  quitar la línea que compara `new.fecha_oferta is distinct from
  old.fecha_oferta`, y **agregar** `notas` a la lista de campos inmutables
  (`expira_en` sí cambia legítimamente al reactivar, así que NO se agrega
  a esa lista — solo se controla que ese cambio pase por las funciones de
  abajo, no por un update arbitrario del cliente).
- El check de `estado` se amplía a
  `check (estado in ('activa','en_negociacion','completada','expirada','eliminada'))`.
- **Se amplía `verificar_acceso_oferta()`** (`create or replace`, sigue
  siendo `before insert`) con la lógica de cupo gratis + tokens:
  ```
  v_activas := (select count(*) from ofertas
                where usuario_id = new.usuario_id
                  and estado in ('activa','en_negociacion'));
  if v_activas >= 5 then
    raise exception 'Ya tiene 5 ofertas activas. Espere a que una expire, se complete o elimine una para publicar otra.';
  elsif v_activas >= 2 then
    perform public.consumir_tokens(1, 'oferta_adicional', new.id);
  end if;
  ```
  (`consumir_tokens` ya existe desde la 2.5 y lanza su propia excepción de
  saldo insuficiente si aplica — se reutiliza tal cual, solo se agrega
  `'oferta_adicional'` al check de `concepto` en `token_movimientos`.)
- **Nuevo trigger `after insert` en `intenciones`** (no en `ofertas`):
  `iniciar_negociacion()` — pone la oferta correspondiente en
  `estado='en_negociacion'`. Como `verificar_acceso_intencion()` (sin
  cambios) ya exige `estado='activa'` para aceptar una intención, esto
  bloquea automáticamente cualquier intención adicional mientras dura la
  negociación — no hace falta tocar esa función.
- **Nuevas funciones `security definer`:**
  - `completar_oferta(p_oferta_id uuid)` — solo el dueño; exige
    `estado='en_negociacion'`; pasa la oferta a `completada` y marca como
    `cerrada` la intención vigente (la más reciente en `enviada`/`vista`
    de esa oferta).
  - `cerrar_negociacion_sin_acuerdo(p_oferta_id uuid)` — la puede llamar
    el dueño de la oferta O quien envió la intención vigente; exige
    `estado='en_negociacion'`; regresa la oferta a `activa` con
    `expira_en = now() + interval '24 hours'`, y marca `cerrada` la
    intención vigente. La usan tanto el botón "Republicar" (dueño) como
    "No se realizó la negociación" (quien respondió) — mismo efecto, dos
    puntos de entrada. **No consume tokens ni pasa por
    `verificar_acceso_oferta()`** (es un `update`, no un `insert`).
- **Nuevo trigger `after update` en `membresias`:**
  `liberar_ofertas_por_cancelacion()` — cuando `new.estado` deja de ser
  `'activa'` (ej. `cancelarMembresia`, ya existente, hace exactamente
  `update membresias set estado='cancelada' ... where estado='activa'`),
  marca `eliminada` todas las ofertas de ese usuario en `activa` o
  `en_negociacion`.
- **Se reemplaza el cron** `expirar-ofertas-medianoche` (que marcaba TODAS
  las activas cada medianoche) por uno que corre **cada hora** y solo
  expira las que ya cumplieron su propio `expira_en` y siguen `activa`
  (las `en_negociacion` no expiran mientras dure la negociación):
  `update ofertas set estado='expirada' where estado='activa' and
  expira_en <= now()`.

### `intenciones` — sin cambios de estructura ni de RLS existentes

Se usa tal cual: `oferta_id`, `usuario_id` (quien responde), `tipo`
(`aceptar_precio`/`solicitar_contacto`), `comentarios`, `estado`
(`enviada`/`vista`/`cerrada`). `estado='enviada'` es la señal de
"nueva/no vista" que alimenta el badge en plataforma — ya se puede
actualizar a `vista`/`cerrada` con la policy existente. Lo único nuevo es
el trigger `after insert` mencionado arriba (vive conceptualmente junto a
`ofertas` pero se dispara desde esta tabla).

### Rutas y componentes

1. **`/ofertas`** — tablero del marketplace: lista las ofertas
   `estado='activa'` de **otras** empresas (requiere sesión + PCD aprobado
   + membresía activa; si no cumple, mensaje explicando qué falta en vez
   del tablero). Cada tarjeta: empresa, sede, operación, moneda, cantidad,
   precio, condiciones, notas, cuenta regresiva hasta `expira_en`, botón
   "Realizar Oferta" (abre modal: tipo + comentarios opcionales).

2. **`/ofertas/mis-ofertas`** — ofertas propias: activas/en negociación
   (con contador X/5 — se indica si las próximas cuestan token — y cuenta
   regresiva) + últimas 5 expiradas/eliminadas/completadas. Botón
   "Publicar oferta" (modal con disclaimer de expiración de 24h y de que
   la 3ra en adelante consume 1 token; deshabilitado si ya tiene 5 activas
   o no tiene membresía activa, con el mensaje correspondiente en cada
   caso). Cada oferta `activa` muestra sus intenciones recibidas (contacto
   revelado, comentario, botón para marcar vista) con badge de "nuevas".
   Cada oferta `en_negociacion` muestra los botones **"Oferta completada"**
   y **"Republicar"**. El badge de "nuevas" vive **solo dentro de esta
   página** — no hay contador global en el header ni en `/dashboard` en
   esta fase.

3. **`/ofertas/mis-intenciones`** (nuevo, para el lado de quien responde)
   — lista las intenciones que el PCD envió a ofertas de otros, con el
   estado de cada una. Cuando la oferta asociada sigue `en_negociacion`,
   se muestra el botón **"No se realizó la negociación"**.

4. **`src/lib/notificaciones/intencion.ts`** (nuevo) — envía el correo
   (Resend) al dueño de la oferta cuando se crea una intención, reutilizando
   el mismo remitente/dominio ya configurado (`noreply@tasadirecta.com`).

5. **Admin — `/admin` (nueva sección "Operaciones")** — tabla de todas las
   ofertas activas/en negociación (con sus intenciones) de la plataforma,
   con botón eliminar (borrado lógico) por oferta. La policy `"oferta:
   admin modera"` ya permite esto a nivel de base de datos; aquí solo
   falta la UI. Sin campo de motivo (a diferencia del rechazo de
   documentos KYC) — es una acción simple, sin necesidad de justificación
   registrada en v1.

6. **Validación (zod, TDD)** — `src/lib/validation/oferta.ts`
   (`ofertaSchema`) e `src/lib/validation/intencion.ts` (`intencionSchema`),
   siguiendo el mismo patrón de los schemas existentes del proyecto.

## Manejo de errores

- Publicar sin membresía activa → rechazado por `verificar_acceso_oferta()`
  (ya existente); la Server Action traduce el error a un mensaje dirigiendo
  a activar membresía.
- Publicar la 3ra-5ta activa sin tokens suficientes → rechazado por
  `consumir_tokens()` (ya existente) desde dentro de la misma función; la
  Server Action traduce a un mensaje de saldo insuficiente con enlace a
  comprar tokens.
- Publicar con 5 activas (gratis o pagadas) → rechazado; la Server Action
  traduce a "espere a que expire, se complete o elimine una para publicar
  otra".
- Responder la propia oferta / oferta no activa (incluye `en_negociacion`)
  → ya rechazado por `verificar_acceso_intencion()` (existente, sin
  cambios) — esto es lo que impide que alguien más responda mientras hay
  una negociación en curso.
- **Membresía cancelada mientras hay ofertas activas/en negociación → se
  eliminan automáticamente todas** (trigger nuevo en `membresias`, ver
  arriba). No siguen su curso.
- Dos PCD intentan responder la misma oferta casi al mismo tiempo → el
  primero cuyo insert se procese pasa la oferta a `en_negociacion`; el
  segundo es rechazado por `verificar_acceso_intencion()` (oferta ya no
  está `activa`), con un mensaje de "esta oferta ya está en negociación
  con otro interesado".

## Fuera de alcance

- Notificación por Telegram/WhatsApp (Fase 5).
- Tabla estructurada de sedes por empresa (se descartó durante el diseño).
- Moderación automática de contenido de las ofertas/notas.
- Historial completo visible en UI de ofertas expiradas/eliminadas más allá
  de las últimas 5 (sigue existiendo en base de datos, solo no se muestra).
- Edición de `moneda`, `operacion`, `sede` o `notas` tras publicar — el
  diseño original de Fase 1 solo permite editar `cantidad`/`precio_cop`, se
  mantiene igual.
- Chat o mensajería interna para negociar — la negociación ocurre fuera de
  la plataforma (celular/correo revelados); no se construye un canal de
  mensajes propio en esta fase.
- Historial de negociaciones fallidas visible para el usuario (queda en
  `intenciones` con `estado='cerrada'` en la base de datos, pero no se
  expone una vista dedicada de "negociaciones pasadas").
