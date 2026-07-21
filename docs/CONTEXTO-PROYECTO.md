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
| 3 — Marketplace | ⬜ | Publicación de ofertas, edición limitada, sedes múltiples |
| 4 — UI del marketplace | ⬜ | Tarjeta de oferta, modal "Realizar Oferta" |
| 5 — Notificaciones y DevOps | ⬜ | Resend + despliegue Vercel |

Rama activa: `fase-2-kyc`. **No mergeada a `master`** — pendiente E2E completo.

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

## Pendiente explícito (lo próximo)

1. **Revisión de abogado del sector cambiario** de los 7 documentos legales
   (ya redactados y publicados como v1 — ver Fase 2.7 arriba). Cuando el
   abogado confirme o ajuste texto, subir `VERSION_LEGAL` en
   `src/lib/legal/documentos.ts` a `v2-...`; el sistema pedirá re-aceptación
   automáticamente. Puntos que los propios textos ya señalan como pendientes
   de confirmar: clasificación Usuario profesional vs. consumidor (Ley 1480)
   en la política de reembolsos, plazos exactos de conservación de datos, y
   la cláusula de arbitraje con sede en Medellín.
2. **E2E manual de toda la rama `fase-2-kyc`** antes de mergear a `master`.
3. Reubicar `ciudad-combobox.tsx` de `src/app/(auth)/registro/` a
   `src/components/` (deuda técnica menor, no bloqueante — se usa desde
   `/vinculacion` importándolo cross-route).
4. **Configurar y probar el workflow de Didit en producción** una vez
   Jaime confirme que el workflow de consola (ID Verification + Passive
   Liveness + Face Match) está funcionando correctamente en Preview, y
   actualizar la URL del webhook registrada en Didit al dominio de
   producción cuando se haga el merge a `master`.

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
