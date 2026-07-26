# Telegram: múltiples personas vinculadas por empresa — Design

**Goal:** Permitir que más de una persona de la misma empresa (PCD) reciba los avisos de Telegram (hasta 3), con opción de desvincular tanto por el propio usuario desde su dashboard como por el admin desde el panel de esa empresa.

**Architecture:** Reemplaza la columna única `perfiles_usuarios.telegram_chat_id` por una tabla `telegram_vinculaciones` (uno a muchos), reforzando el tope de 3 con un trigger en la base de datos (mismo patrón que el tope de 5 ofertas activas). El deep-link/QR (`telegram_link_token`) no cambia — sigue siendo uno solo por empresa, ahora simplemente lo puede usar más de una persona. Se actualizan los 4 puntos que hoy leen `telegram_chat_id` para notificar a *todos* los chats vinculados de una empresa, no solo a uno.

**Tech Stack:** Supabase (Postgres, RLS, trigger), Next.js Server Actions, TypeScript. Sin librerías nuevas.

---

## 1. Migración de base de datos

**Crea:** `supabase/migrations/0017_telegram_multiples_vinculaciones.sql`

```sql
-- 1. Tabla telegram_vinculaciones ------------------------------------------------
create table public.telegram_vinculaciones (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfiles_usuarios(id),
  chat_id        text not null,
  nombre_mostrar text not null,
  created_at     timestamptz not null default now(),
  unique (usuario_id, chat_id)
);

alter table public.telegram_vinculaciones enable row level security;

create policy "telegram_vinculaciones: propio lee" on public.telegram_vinculaciones
  for select to authenticated using (usuario_id = auth.uid());

create policy "telegram_vinculaciones: admin lee todo" on public.telegram_vinculaciones
  for select to authenticated using (public.es_admin());

create policy "telegram_vinculaciones: propio elimina" on public.telegram_vinculaciones
  for delete to authenticated using (usuario_id = auth.uid());

create policy "telegram_vinculaciones: admin elimina" on public.telegram_vinculaciones
  for delete to authenticated using (public.es_admin());

-- Sin insert directo: solo el webhook (cliente de servicio) escribe aquí.
create policy "telegram_vinculaciones: sin insert directo" on public.telegram_vinculaciones
  for insert to authenticated with check (false);

-- 2. Tope de 3 por empresa, en la base de datos ----------------------------------
create or replace function public.verificar_tope_telegram()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_otros integer;
begin
  select count(*) into v_otros
  from public.telegram_vinculaciones
  where usuario_id = new.usuario_id and chat_id <> new.chat_id;

  if v_otros >= 3 then
    raise exception 'Ya tiene el máximo de 3 personas vinculadas por Telegram. Desvincule a alguien para agregar otra.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_tope_telegram
  before insert on public.telegram_vinculaciones
  for each row execute function public.verificar_tope_telegram();

-- 3. Backfill desde la columna vieja ----------------------------------------------
insert into public.telegram_vinculaciones (usuario_id, chat_id, nombre_mostrar)
select id, telegram_chat_id, 'Vinculación existente'
from public.perfiles_usuarios
where telegram_chat_id is not null
on conflict (usuario_id, chat_id) do nothing;

-- 4. Elimina la columna vieja (ya migrada) ----------------------------------------
alter table public.perfiles_usuarios drop column if exists telegram_chat_id;
```

**Nota de diseño:** el trigger excluye `chat_id = new.chat_id` del conteo — así, si alguien que YA está vinculado vuelve a darle "Start" (reconfirmación, o Telegram le cambió el nombre), no se bloquea por el tope; solo bloquea un chat_id genuinamente nuevo cuando ya hay 3 distintos.

---

## 2. Tipos TypeScript

**Modifica:** `src/types/database.ts`
- `perfiles_usuarios.Row`/`Insert` pierden `telegram_chat_id` (queda solo `telegram_link_token`).
- Nueva tabla `telegram_vinculaciones` con `Row: { id, usuario_id, chat_id, nombre_mostrar, created_at }`, `Insert: never` (solo escribe el webhook con el cliente de servicio, no pasa por los tipos del cliente normal), `Update: never`.

---

## 3. Webhook (`/api/webhooks/telegram/route.ts`)

Reemplaza el `update` a `perfiles_usuarios` por un `insert ... on conflict (usuario_id, chat_id) do update set nombre_mostrar = excluded.nombre_mostrar` sobre `telegram_vinculaciones`, usando como `nombre_mostrar` lo que venga de `update.message.from` (`first_name` + `last_name` si existe, o `@username`, o "Usuario de Telegram" como último recurso).

Si el insert falla por el trigger de tope, el webhook responde por Telegram al `chat_id` que intentó vincularse con el mensaje del error tal cual (ya viene listo para mostrarse, mismo patrón que el resto del código traduce errores de Postgres). Si falla por cualquier otra razón, mismo manejo silencioso que hoy (log + `200 ok`, Telegram no debe reintentar).

---

## 4. Helpers compartidos de lectura

**Modifica:** `src/lib/telegram/vinculacion.ts` (ya existe, tiene `parseTokenInicio`/`deepLinkVinculacion`)

Agrega dos funciones, ambas usando el cliente de servicio (necesitan leer chats de OTROS usuarios, igual que ya justifica el código actual para `telegram_chat_id`):

```ts
export async function chatIdsDe(usuarioId: string): Promise<string[]>
```
Para los 3 casos de "una sola empresa" (nueva intención, oferta aceptada, reactivar PCD).

```ts
export async function chatIdsPorUsuarios(usuarioIds: string[]): Promise<Map<string, string[]>>
```
Para el caso de "varias empresas a la vez" (alerta a mi ciudad) — una sola consulta `in(...)`, evita N+1.

---

## 5. Puntos que notifican (4 lugares — actualizar TODOS, doble-check explícito)

Cada uno pasa de "si hay un chat_id, un mensaje" a "un mensaje por cada chat_id vinculado":

1. `src/app/ofertas/actions.ts` — nueva intención sobre una oferta → dueño (usa `chatIdsDe`).
2. `src/app/ofertas/actions.ts` — oferta aceptada → quien respondió (usa `chatIdsDe`).
3. `src/app/ofertas/actions.ts` — alerta a mi ciudad → varios candidatos (usa `chatIdsPorUsuarios`; el fallback a correo se mantiene igual: solo si esa empresa no tiene NINGÚN chat vinculado).
4. `src/app/admin/actions.ts` — reactivar PCD → el PCD (usa `chatIdsDe`).

**Verificación explícita antes de dar por terminada esta tarea:** correr `grep -rn "telegram_chat_id" src/` y confirmar que NO queda ningún resultado (todo debe usar la tabla nueva) — así no se repite el tipo de cabo suelto del build roto de hoy.

---

## 6. Dashboard del PCD (`src/app/dashboard/telegram-card.tsx`)

Pasa a Server Component que recibe la lista de vinculaciones (en vez de un solo `chatId`). Estructura:
- Si hay 1-3 vinculadas: lista de tarjetas "Nombre — vinculado el DD/MM" + botón "Desvincular" (client component con confirmación, llama a la Server Action nueva).
- Debajo de la lista (o en vez de ella si no hay ninguna): el QR + instrucciones + botones de descarga de siempre — **siempre visible**, salvo que ya haya 3, donde se reemplaza por un aviso de tope alcanzado.

**Crea:** `src/app/dashboard/telegram-actions.ts` — `'use server'`, exporta **solo** la función async `desvincularTelegram(_prev, formData)` (aprendizaje de hoy: un archivo `'use server'` no puede exportar nada que no sea función async — si se necesita algo más, va en otro archivo). Borra por `id` — la política RLS `"telegram_vinculaciones: propio elimina"` ya garantiza que solo se pueda borrar la propia fila.

**Modifica:** `src/app/dashboard/page.tsx` — trae la lista de vinculaciones del usuario en vez de `perfil.telegram_chat_id`, se la pasa a `TelegramCard`.

---

## 7. Panel admin (`/admin/usuarios/[id]`)

**Crea:** `src/app/admin/usuarios/[id]/telegram-vinculado.tsx` — card simple (sin acordeón, máximo 3 filas) con la lista de vinculaciones de esa empresa + botón "Desvincular" por fila.

**Modifica:** `src/app/admin/actions.ts` — nueva función `eliminarVinculacionTelegram` (mismo patrón que `eliminarCalificacion`: `exigirAdmin()`, borra por `id`, `revalidatePath('/admin', 'layout')`). La política RLS `"telegram_vinculaciones: admin elimina"` respalda esto a nivel de base de datos.

**Modifica:** `src/app/admin/usuarios/[id]/page.tsx` — trae las vinculaciones de ese usuario, monta `<TelegramVinculado />` en el expediente.

---

## Testing y verificación

- No hay lógica de negocio nueva que amerite test unitario (es CRUD + notificación, sin validación zod nueva).
- **Obligatorio antes de mergear**: `npx tsc --noEmit`, `npm test`, **y `npm run build`** (el error de hoy solo lo detecta el build, no tsc ni vitest).
- Verificación manual en navegador/scripts: vincular 2 "personas" distintas (dos sesiones/chat_id simulados) a la misma empresa, confirmar que ambas reciben la notificación de una intención nueva; intentar una 4ª → debe rechazarse con el mensaje de tope; desvincular una desde el dashboard propio y otra desde el panel admin; confirmar que "alerta a mi ciudad" sigue cayendo a correo para empresas sin ningún Telegram vinculado.
- Confirmar con `grep -rn "telegram_chat_id" src/` que no queda ningún rastro de la columna vieja.

## Fuera de alcance

- No hay un login individual por persona de Telegram: las 3 personas vinculadas comparten la única cuenta web de la empresa (el mismo correo/contraseña de siempre) — desde esa sesión se ve y se puede desvincular cualquiera de las 3 filas, sin distinguir "quién la vinculó".
- No hay límite de mensajes ni throttling adicional — cada chat vinculado recibe cada notificación, tal como antes recibía el único chat vinculado.
