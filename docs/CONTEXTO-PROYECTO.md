# Contexto del proyecto — leer primero en cualquier sesión nueva

Este documento es el punto de entrada para retomar el proyecto en una sesión
nueva de Claude (Code, Opus/Fable para planear, o cualquier otra). El README
tiene el detalle técnico; aquí está el "por qué" y el estado actual.

## Quién y cómo trabajamos

- **Product owner:** Jaime Calle (jaimecalle@gmail.com). Dirige el producto,
  valida cada fase antes de seguir. Trabaja en español.
- **Flujo de trabajo fijo:** primero planear (modelo Opus/Fable, sin código —
  solo estructurar), luego cambiar explícitamente a Sonnet para programar.
  Jaime lo pide así: *"primero pensemos luego implementamos"*.
- **Fases iterativas con validación entre cada una** — no avanzar a la
  siguiente fase ni mergear a `master` sin su aprobación explícita.
- **Merge a `master` diferido** hasta hacer un E2E manual completo de TODA la
  rama activa (no solo de la última fase), política reafirmada varias veces.
- Para tareas de implementación se usa el patrón subagent-driven-development:
  implementador → revisor de spec → revisor de calidad, con hallazgos
  "Important" corregidos directamente, no re-despachados.

## Reglas de oro del negocio (no negociables)

Ver el detalle en [`README.md`](../README.md#reglas-de-oro-del-negocio-obligatorias-para-todo-el-equipo).
Resumen:

1. **Nunca decir "casas de cambio"** — los usuarios son **PCD (Profesionales
   de Compra y Venta de Divisas)** autorizados por la DIAN.
2. Tasa Directa es **marketplace B2B que NO ejecuta ni liquida transacciones**
   — solo conecta oferta y demanda. Mantra: *"Seguridad y Confianza"*.
3. UI clara/institucional, acentos en el **verde exacto de la marca**
   (`#088060`, derivado por muestreo científico del logo — ver
   `src/app/globals.css`), Tailwind + shadcn/ui (shadcn está sobre **Base UI,
   no Radix** — `Button` no tiene `asChild`, usa `render`).

## Estado de fases

| Fase | Estado | Qué es |
|---|---|---|
| 1 — Datos y arquitectura | ✅ | Esquema SQL, RLS, expiración diaria |
| 2 — Admin y KYC | ✅ | Registro, carga de documentos, panel de cumplimiento |
| 2.5 — Modelo comercial | ✅ | Suscripción única + tokens, gestión comercial admin, arquitectura Bold |
| 2.6 — Onboarding en 3 etapas | ✅ | Cuenta → perfil de empresa → contrato digital (ver README) |
| 2.7 — 7 documentos legales | ✅ | Registro versionado, páginas públicas `/legal`, click-wrap con snapshot de identidad |
| Verificación de identidad (Didit) | ✅ | Cuarto requisito de aprobación, webhook firmado, ver README |
| 3+4 — Marketplace y su UI | ✅ | Publicar/ver ofertas, ciclo de negociación, panel admin Operaciones, rediseño tipo marketplace moderno — ver README |
| 5 — Notificaciones y DevOps | ⬜ | Telegram/WhatsApp para el PCD (ya hay Telegram admin para ofertas/intenciones) |

**Mergeado a `master` y en producción (2026-07-22)**: decisión explícita de Jaime de migrar ya a `www.tasadirecta.com` en vez de seguir probando en el Preview de Vercel, dado que casi toda la fricción reciente (protección de despliegue, allow-list de redirect de Supabase, confusión de cuentas de Resend) era del entorno Preview y no de la app. El código no tenía ninguna URL de Vercel hardcodeada (todo usa origen dinámico), así que no hubo que tocar rutas — solo había que actualizar dos configuraciones externas: el webhook de Didit (URL de producción, sin el bypass de Vercel) y confirmar el Redirect URL de Supabase, ambos ya hechos. El ciclo completo del marketplace con dos cuentas PCD reales sigue sin probarse de punta a punta — es lo próximo, ya en producción.

## Decisiones estratégicas clave (por qué, no solo qué)

- **Modelo comercial (2026-07-14):** se abandonaron los tiers Plus/Premium con
  cuotas diarias. Razón: un modelo de cuotas monetiza *restringir actividad*
  justo cuando el marketplace más necesita liquidez. El nuevo modelo monetiza
  *atención* (destacar oferta, alertas premium, urgente, republicación) vía
  billetera de tokens, no actividad. Suscripción única `estandar` sin cuotas,
  cobro por empresa (NIT). Detalle: [`decisiones-fase-1.md`](decisiones-fase-1.md),
  [`arquitectura-pagos-bold.md`](arquitectura-pagos-bold.md).
- **Pagos Bold:** fase actual es manual (admin activa membresía tras confirmar
  pago por link enviado a mano); webhook ya stubbeado para automatizar después.
- **Onboarding en 3 etapas (2026-07-15, Fase 2.6):** un formulario único de
  registro estaba demasiado incompleto y abrumaba al usuario. Se separó en
  cuenta mínima → perfil de empresa completo (`/vinculacion`, incluye
  representante legal y persona de contacto) → contrato de servicios +
  autorización de tratamiento de datos con aceptación digital trazable
  (`/contrato`, IP + user-agent + versión, tabla `aceptaciones` inmutable).
  Detalle completo en el README, sección "Onboarding del PCD".
- **7 documentos legales (2026-07-15, Fase 2.7):** Jaime generó los 7 documentos
  (contrato, autorización de datos, política de tratamiento, términos y
  condiciones, aviso de privacidad, política KYC, política de reembolsos) con
  un asistente legal externo (brief: [`BRIEF-LEGALES-tasadirecta.txt`](../BRIEF-LEGALES-tasadirecta.txt)).
  Se publicaron **limpios como versión final v1** (no como borrador con banner)
  porque un banner de "pendiente de aprobación legal" debilitaría la validez
  del click-wrap — en su lugar, cada documento lleva `VERSION_LEGAL` y cuando
  el abogado del sector cambiario apruebe/ajuste el texto, se sube la versión
  y el sistema exige re-aceptación automáticamente. Decisión de UX: **una
  casilla por documento** (máxima explicitud) en vez de agrupar. La
  Autorización de Tratamiento de Datos se acepta en `/vinculacion` (etapa 2,
  al momento de entregar los datos, por exigencia de la Ley 1581); los otros 6
  se aceptan en `/contrato` (etapa 3). Cada aceptación guarda un **snapshot de
  identidad** (razón social, NIT, representante legal) para que la evidencia
  no dependa de un perfil editable. Registro: `src/lib/legal/documentos.ts`.
- **Resend:** el dominio compartido `onboarding@resend.dev` solo envía al
  dueño de la cuenta — se creó una **segunda cuenta de Resend** separada y se
  verificó `tasadirecta.com` ahí (con subdominio `send.` para no chocar con
  Zoho Mail si Jaime monta correo corporativo en el dominio raíz).
- **Ciudades:** dropdown buscable basado en DANE/DIVIPOLA, Bogotá D.C. como
  departamento propio (no anidado bajo Cundinamarca), según ISO 3166-2:CO.
- **Notificaciones internas:** bot de Telegram (@Tasa_Directa_bot) avisa de
  nuevo registro, KYC completo, y PCD aprobado.
- **Marketplace de ofertas (2026-07-21, Fase 3+4):** al construir la UI se
  descubrió que la mayor parte del backend (RLS, triggers de acceso, la vista
  `perfiles_publicos`, el modelo de tokens) ya existía desde las Fases 1 y
  2.5 — Fase 3/4 solo faltaba la capa de UI. Se ajustó el modelo de límites:
  ya no hay tope fijo de 5 gratis, ahora son **2 gratis + hasta 3 más pagando
  1 token cada una** (nuevo concepto `oferta_adicional`), y la expiración pasó
  de "medianoche Colombia para todas" a **24h individuales por oferta** (cron
  cada hora). Se agregó un ciclo de negociación (`en_negociacion` →
  completada/reactivada) que no existía en el diseño original de Fase 1:
  al llegar la primera intención la oferta se bloquea para nuevas respuestas;
  el dueño puede completar o republicar, quien respondió puede liberar sin
  acuerdo — ambas acciones de liberar son **siempre gratis** (reactivan la
  misma fila, no crean una nueva) porque cobrar por una negociación fallida
  se consideró poco ético. Al cancelar la membresía de un PCD se eliminan
  automáticamente todas sus ofertas activas. Durante la implementación se
  encontraron y corrigieron varios bugs reales vía el ciclo de revisión:
  condiciones de carrera en el tope de ofertas/negociación (falta de locks),
  una brecha de RLS que dejaba ver el mercado completo sin aprobación ni
  membresía, y otra que —al cerrarla— por poco le quitaba a quien responde
  la visibilidad de su propia negociación. Detalle completo:
  `docs/superpowers/specs/2026-07-21-marketplace-ofertas-design.md` y
  `supabase/migrations/0007_marketplace_ofertas.sql`.

## Pendiente explícito (lo próximo)

1. **Revisión de abogado del sector cambiario** de los 7 documentos legales
   (ya redactados y publicados como v1 — ver Fase 2.7 arriba). Cuando el
   abogado confirme o ajuste texto, subir `VERSION_LEGAL` en
   `src/lib/legal/documentos.ts` a `v2-...`; el sistema pedirá re-aceptación
   automáticamente. Puntos que los propios textos ya señalan como pendientes
   de confirmar: clasificación Usuario profesional vs. consumidor (Ley 1480)
   en la política de reembolsos, plazos exactos de conservación de datos, y
   la cláusula de arbitraje con sede en Medellín.
2. Reubicar `ciudad-combobox.tsx` de `src/app/(auth)/registro/` a
   `src/components/` (deuda técnica menor, no bloqueante — se usa desde
   `/vinculacion` importándolo cross-route).
3. **Probar el ciclo completo del marketplace con dos cuentas PCD reales**
   (publicar → responder → negociar → completar/republicar) — todas las
   migraciones (hasta 0009) ya están corridas y verificadas contra la base
   real de producción; falta el E2E de punta a punta con dos cuentas.
4. **Notificación por Telegram/WhatsApp al PCD** de nuevas intenciones — se
   dejó fuera de la Fase 3+4 a propósito (el admin ya recibe Telegram al
   publicarse ofertas o recibirse intenciones; falta el aviso al propio PCD).

## Dónde está cada cosa

- Reglas de negocio + roadmap + modelo de datos: [`README.md`](../README.md)
- Decisiones y preguntas abiertas de Fase 1: [`decisiones-fase-1.md`](decisiones-fase-1.md)
- Arquitectura de pagos Bold: [`arquitectura-pagos-bold.md`](arquitectura-pagos-bold.md)
- Arquitectura de validación de identidad: [`arquitectura-validacion-identidad.md`](arquitectura-validacion-identidad.md)
- Reglas de oro y workflow de Jaime también viven en la memoria persistente
  de Claude (`tasadirecta-proyecto.md`, `tasadirecta-reglas-negocio.md`,
  `user-jaime-workflow.md`) — este archivo es la versión que vive **con el
  código**, para cuando no hay memoria de Claude disponible (otra máquina,
  otra herramienta, otro colaborador).
