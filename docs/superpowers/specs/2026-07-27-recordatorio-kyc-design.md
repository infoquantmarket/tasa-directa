# Recordatorio automático de documentación KYC — Diseño

**Fecha:** 2026-07-27
**Estado:** Aprobado por el usuario, pendiente de plan de implementación

## Motivación

Varios usuarios se registran (crean cuenta) pero nunca suben ningún documento
KYC — quedan "atascados" en el registro sin avanzar hacia la aprobación. Se
necesita un proceso automático que les recuerde por correo que deben cargar
su documentación en `/vinculacion` para poder empezar a operar en el
mercado.

## Criterio: ¿quién está "atascado"?

Un usuario califica para recibir un recordatorio cuando se cumplen **todas**
estas condiciones:

1. `perfiles_usuarios.estado = 'pendiente'` (aún no fue aprobado, rechazado
   ni suspendido).
2. `perfiles_usuarios.rol = 'usuario'` (excluye cuentas admin).
3. Cero filas en `documentos_kyc` para ese `usuario_id` — no subió **ninguno**
   de los 3 documentos requeridos.
4. Han pasado **≥24 horas** desde `perfiles_usuarios.created_at`.
5. Lleva **menos de 3** recordatorios enviados (`recordatorios_kyc_enviados < 3`).
6. El último recordatorio (si existe) fue enviado hace **≥3 días**, o nunca
   se le ha enviado uno.

**Nota importante:** el perfil de la empresa (`perfil_completo`) y los
documentos se pueden llenar en cualquier orden (así lo dice la propia página
de `/vinculacion`). Por eso el criterio de "atascado" depende únicamente de
si subió documentos, sin importar si completó el formulario de perfil.

Como el criterio no distingue cuánto tiempo lleva atascado un usuario (solo
mira `created_at` y los contadores de recordatorio), **la primera vez que
corra el cron va a incluir a todo el backlog actual** (usuarios que llevan
días o semanas registrados) — tal como se decidió con el usuario. De ahí en
adelante, cada usuario sigue el mismo ciclo (máx. 3 recordatorios, cada 3
días) sin importar si es un registro nuevo o antiguo.

## Arquitectura

El proyecto ya usa `pg_cron` dentro de Supabase para expirar ofertas a
medianoche (`0001b_cron_expiracion.sql`), pero ese cron solo hace un
`UPDATE` — nunca sale a llamar una API externa. Enviar un correo sí requiere
llamar la API HTTP de Resend, y **eso siempre se hace en TypeScript** en este
proyecto (`src/lib/resend/cliente.ts`), nunca desde SQL. Por eso este
recordatorio combina ambas piezas, igual que ya se anticipó en el propio
comentario de `0001b_cron_expiracion.sql` ("ALTERNATIVA: Vercel Cron") y en
`.env.example` (`CRON_SECRET` ya está reservado ahí con esa nota exacta).

```
Vercel Cron (diario, 8am Colombia)
  → GET /api/cron/recordatorio-kyc  (protegida con Bearer CRON_SECRET)
      → RPC usuarios_para_recordatorio_kyc()   [lee candidatos]
      → por cada candidato: notificarRecordatorioKyc() vía Resend
      → RPC registrar_recordatorio_kyc(usuario_id)   [marca como enviado]
```

### Cambios de esquema (migration `0018_recordatorio_kyc.sql`)

Dos columnas nuevas en `perfiles_usuarios` (no hace falta una tabla aparte —
solo se necesita "cuántos van" y "cuándo fue el último", no un historial
detallado):

```sql
alter table public.perfiles_usuarios
  add column if not exists recordatorios_kyc_enviados smallint not null default 0,
  add column if not exists recordatorio_kyc_ultimo_envio timestamptz;
```

### Función `usuarios_para_recordatorio_kyc()`

`security definer`, devuelve `usuario_id`, `correo`, `razon_social`,
`numero_recordatorio` (= `recordatorios_kyc_enviados + 1`, solo para
logging). Aplica el criterio de arriba con un `not exists` contra
`documentos_kyc`.

**Seguridad:** a diferencia de las demás funciones `security definer` del
proyecto (que están pensadas para ser llamadas por cualquier usuario
autenticado y usan `auth.uid()` para limitar qué puede hacer cada quien),
esta función expone correos y razón social de **todas** las empresas —
nunca debe poder llamarla un usuario normal. Sigue el mismo patrón ya usado
en `proteger_perfil()` (`0001_esquema_inicial.sql`): revisa
`auth.role() = 'service_role'` al inicio y lanza excepción si no lo es. Esto
la deja utilizable solo desde el cliente de service-role (el que usa la
ruta del cron), igual que `registrar_recordatorio_kyc()`.

### Función `registrar_recordatorio_kyc(p_usuario_id uuid)`

`security definer`, mismo chequeo de `service_role`. Incrementa
`recordatorios_kyc_enviados` y actualiza `recordatorio_kyc_ultimo_envio =
now()` para ese usuario.

### Ruta `src/app/api/cron/recordatorio-kyc/route.ts`

`GET`, valida `Authorization: Bearer ${process.env.CRON_SECRET}` (401 si no
coincide — mismo patrón ya documentado en `0001b_cron_expiracion.sql`).
Usa el cliente de service-role para llamar la RPC, envía el correo a cada
candidato con `notificarRecordatorioKyc`, y llama
`registrar_recordatorio_kyc` tras cada envío.

### `vercel.json` (nuevo archivo, raíz del repo)

```json
{
  "crons": [
    { "path": "/api/cron/recordatorio-kyc", "schedule": "0 13 * * *" }
  ]
}
```

El schedule ya lo confirmó el usuario (8am Colombia = 13:00 UTC).

### Correo — `src/lib/notificaciones/recordatorio-kyc.ts`

Mismo patrón que `notificarSuspension`/`notificarReactivacion`
(`src/lib/notificaciones/estado-cuenta.ts`): función `notificarRecordatorioKyc(input:
{ correo, razonSocial }): Promise<void>` que arma el HTML y llama
`enviarCorreo`. **Un solo texto para los 3 envíos** (no varía entre el
recordatorio 1, 2 o 3):

- Asunto: "Complete su vinculación en Tasa Directa"
- Cuerpo: recuerda que falta cargar los documentos (RUT, Cámara de
  Comercio, Resolución DIAN) para poder conectar con otros PCD, publicar y
  responder ofertas; enlace directo a `/vinculacion`.

### Visibilidad en el panel admin

En `src/app/admin/usuarios/[id]/perfil-empresa.tsx` (o una línea junto al
`EstadoBadge` en `page.tsx`), se agrega un texto simple:

> Recordatorios KYC: 2/3 enviados · último: 24 jul 2026

usando las columnas nuevas, que ya vienen en el `select('*')` existente de
`perfiles_usuarios` en esa página — no hace falta ninguna consulta nueva.

## Manejo de errores

`enviarCorreo` ya está diseñado para nunca lanzar (`best-effort`, igual que
el resto de notificaciones del proyecto) — si Resend falla, el error se
loguea pero no se propaga. Esto significa que la ruta del cron **siempre**
marcará el recordatorio como enviado tras intentarlo, incluso si el correo
no llegó realmente. Es una decisión deliberada, consistente con el resto
del proyecto: el peor caso es que ese usuario espere un ciclo completo (3
días) para el siguiente intento, en vez de reintentar de inmediato. No se
justifica una cola de reintentos para un recordatorio de baja criticidad.

Si `RESEND_API_KEY` no está configurado, `enviarCorreo` ya loguea una
advertencia y no hace nada (mismo comportamiento que hoy).

## Variables de entorno

`CRON_SECRET` ya está reservado en `.env.example` con la nota "Secret para
el Vercel Cron" — significa que este mecanismo ya estaba anticipado desde
el scaffolding inicial del proyecto. Falta:
1. Generar un valor real (`openssl rand -hex 32` o equivalente).
2. Configurarlo como variable de entorno en el proyecto de Vercel
   (Production **y** Preview, ya que Vercel Cron solo corre en Production,
   pero es buena práctica tenerlo en ambos entornos).

## Testing

- **`src/lib/notificaciones/recordatorio-kyc.ts`**: función pura (arma
  HTML a partir de un input), se puede probar con Vitest igual que el resto
  de `src/lib/notificaciones/` — verificar que el asunto, el enlace a
  `/vinculacion` y el escape de HTML en `razonSocial` sean correctos.
- **Función SQL y ruta del cron**: no hay infraestructura de tests SQL en
  este proyecto (las funciones `security definer` se verifican con scripts
  Node de un solo uso contra la base real, como se hizo para reputación y
  Telegram). Se verificará manualmente con un script `_tmp-*.mjs` usando el
  cliente de service-role: crear un usuario de prueba con `created_at` en
  el pasado (vía `update` directo, ya que el trigger fija `created_at =
  now()` al crearlo), confirmar que aparece en
  `usuarios_para_recordatorio_kyc()`, confirmar que un usuario con al menos
  un documento NO aparece, y confirmar que tras 3 llamadas a
  `registrar_recordatorio_kyc` deja de calificar.
- **Verificación de que la ruta rechaza sin el bearer correcto** (401) y la
  acepta con el `CRON_SECRET` correcto — se puede probar en local con
  `curl` contra el servidor de desarrollo.
- `npm run build` obligatorio antes de cada push que toque archivos
  `'use server'` o rutas API (lección ya aprendida esta semana).

## Fuera de alcance

- No hay botón manual en el panel admin para forzar un envío puntual (el
  usuario decidió que el cron automático basta).
- No se varía el texto del correo entre el 1º, 2º y 3º envío.
- No se notifica nada a usuarios con `estado` distinto de `pendiente`, ni a
  quienes ya subieron al menos un documento (aunque no hayan completado el
  perfil de la empresa).
