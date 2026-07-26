# Telegram: múltiples personas vinculadas por empresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir hasta 3 personas vinculadas por Telegram por empresa (en vez de 1), con nombre visible y opción de desvincular tanto desde el dashboard del PCD como desde el panel admin.

**Architecture:** Reemplaza `perfiles_usuarios.telegram_chat_id` (columna única) por la tabla `telegram_vinculaciones` (uno a muchos), con el tope de 3 reforzado por un trigger en la base de datos. `telegram_link_token` no cambia. Se actualizan los 5 archivos que hoy leen/escriben `telegram_chat_id`.

**Tech Stack:** Supabase (Postgres, RLS, trigger), Next.js Server Actions, TypeScript. Sin librerías nuevas.

**Spec:** [`docs/superpowers/specs/2026-07-26-telegram-multiples-vinculaciones-design.md`](../specs/2026-07-26-telegram-multiples-vinculaciones-design.md)

---

## Contexto imprescindible para el ejecutor (sin memoria del proyecto)

- **Nombres verificados contra la base de datos real antes de escribir este plan** (2026-07-26): la tabla `telegram_vinculaciones`, la función `verificar_tope_telegram` y el trigger `trg_tope_telegram` NO existen todavía — sin conflicto. `perfiles_usuarios.telegram_chat_id` y `telegram_link_token` sí existen hoy tal como se describen abajo.
- **Los 5 puntos que tocan `telegram_chat_id` hoy** (verificado con `grep -rn "telegram_chat_id" src/` antes de escribir este plan): `src/types/database.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/telegram-card.tsx`, `src/app/api/webhooks/telegram/route.ts`, `src/app/ofertas/actions.ts` (3 lugares: `realizarOferta`, `aceptarIntencion`, `enviarAlertaCiudad`), `src/app/admin/actions.ts` (`reactivarUsuario`). **Todos** se tocan en este plan — al terminar, `grep -rn "telegram_chat_id" src/` debe devolver 0 resultados.
- **⚠️ Lección del mismo día (aplicar en cada task de este plan):** un archivo `'use server'` en Next.js/Turbopack solo puede exportar funciones `async` — cualquier otra exportación (helper síncrono, constante, tipo de valor) rompe el build con "Server Actions must be async functions", y **ni `tsc` ni `vitest` lo detectan, solo `next build`**. Por eso `src/app/dashboard/telegram-actions.ts` (Task TG5) exporta ÚNICAMENTE `desvincularTelegram` (async) — nada más. **Correr `npm run build` al final de CADA task que toque un archivo `'use server'`**, no solo al final del plan.
- **`telegram_vinculaciones` SÍ necesita un `Insert` type real** (a diferencia de `calificaciones`, que solo se escribe vía una función `security definer` y por eso su `Insert` es `never`): aquí el webhook hace un `upsert()` directo con el cliente de servicio, así que el tipo debe permitir construir ese payload — `Insert: Omit<Row, 'id' | 'created_at'>`, NO `never`. Este es el tipo de detalle que el usuario pidió doble-revisar.
- **El trigger de tope excluye el propio `chat_id` del conteo** (`where usuario_id = new.usuario_id and chat_id <> new.chat_id`) para que alguien YA vinculado pueda volver a darle "Start" (reconfirmación) sin que lo bloquee el tope — solo un chat_id genuinamente nuevo cuenta.
- **Patrón de notificación best-effort ya establecido:** `notificarTelegram(mensaje, chatId?)` nunca lanza. Para notificar a varios chats de la misma empresa, se llama en bucle con `Promise.all` — mismo patrón que ya usa `enviarAlertaCiudad` para varios destinatarios.
- **Aplicación de migraciones:** Jaime corre el SQL manualmente en el SQL Editor de Supabase. Esta migración, igual que las anteriores con blast radius alto, se commitea en `fase-2-kyc` y **NO se fusiona a `master` hasta que Jaime confirme haberla corrido**.
- Verificación estándar: `npx tsc --noEmit`, `npm test`, **y `npm run build`** (obligatorio esta vez).

## File Structure

- **Create** `supabase/migrations/0017_telegram_multiples_vinculaciones.sql`.
- **Modify** `src/types/database.ts` — `perfiles_usuarios` pierde `telegram_chat_id`, nueva tabla `telegram_vinculaciones`.
- **Modify** `src/lib/telegram/vinculacion.ts` — agrega `chatIdsDe`/`chatIdsPorUsuarios`.
- **Modify** `src/app/api/webhooks/telegram/route.ts` — inserta en la tabla nueva en vez de actualizar la columna.
- **Modify** `src/app/ofertas/actions.ts` — 3 puntos de notificación usan los helpers nuevos.
- **Modify** `src/app/admin/actions.ts` — `reactivarUsuario` usa el helper nuevo; se agrega `eliminarVinculacionTelegram`.
- **Modify** `src/app/dashboard/telegram-card.tsx` — lista de vinculados + QR siempre visible salvo tope.
- **Create** `src/app/dashboard/boton-desvincular-telegram.tsx`.
- **Create** `src/app/dashboard/telegram-actions.ts` — `desvincularTelegram` (única exportación, async).
- **Modify** `src/app/dashboard/page.tsx` — trae la lista de vinculaciones.
- **Create** `src/app/admin/usuarios/[id]/telegram-vinculado.tsx`.
- **Modify** `src/app/admin/usuarios/[id]/page.tsx` — trae vinculaciones de esa empresa, monta la sección.

---

### Task TG1: Migration 0017 — tabla, RLS, trigger de tope, backfill, drop columna vieja

**Files:**
- Create: `supabase/migrations/0017_telegram_multiples_vinculaciones.sql`

- [ ] **Step 1: Escribir la migration completa**

```sql
-- =============================================================================
-- TASA DIRECTA · Telegram: múltiples personas vinculadas por empresa (hasta 3)
-- Reemplaza perfiles_usuarios.telegram_chat_id (1 chat por empresa) por la
-- tabla telegram_vinculaciones (1 a muchos). telegram_link_token NO cambia —
-- sigue siendo un solo QR/enlace por empresa, ahora lo puede usar más de una
-- persona. Idempotente.
-- =============================================================================

-- 1. Tabla telegram_vinculaciones ------------------------------------------------
create table if not exists public.telegram_vinculaciones (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.perfiles_usuarios(id),
  chat_id        text not null,
  nombre_mostrar text not null,
  created_at     timestamptz not null default now(),
  unique (usuario_id, chat_id)
);

alter table public.telegram_vinculaciones enable row level security;

drop policy if exists "telegram_vinculaciones: propio lee" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: propio lee" on public.telegram_vinculaciones
  for select to authenticated using (usuario_id = auth.uid());

drop policy if exists "telegram_vinculaciones: admin lee todo" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: admin lee todo" on public.telegram_vinculaciones
  for select to authenticated using (public.es_admin());

drop policy if exists "telegram_vinculaciones: propio elimina" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: propio elimina" on public.telegram_vinculaciones
  for delete to authenticated using (usuario_id = auth.uid());

drop policy if exists "telegram_vinculaciones: admin elimina" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: admin elimina" on public.telegram_vinculaciones
  for delete to authenticated using (public.es_admin());

-- Sin insert directo desde el cliente autenticado normal: solo el webhook
-- (cliente de servicio, que no pasa por RLS) escribe aquí.
drop policy if exists "telegram_vinculaciones: sin insert directo" on public.telegram_vinculaciones;
create policy "telegram_vinculaciones: sin insert directo" on public.telegram_vinculaciones
  for insert to authenticated with check (false);

-- 2. Tope de 3 chats distintos por empresa, en la base de datos ------------------
--    Excluye el propio chat_id del conteo: si alguien YA vinculado vuelve a
--    darle "Start" (reconfirmación), no debe bloquearlo el tope.
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

drop trigger if exists trg_tope_telegram on public.telegram_vinculaciones;
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

- [ ] **Step 2: Verificar que el archivo quedó bien escrito**

Run: `cat supabase/migrations/0017_telegram_multiples_vinculaciones.sql`
Expected: el contenido de arriba. (La aplicación real la corre Jaime en el SQL Editor de Supabase — NO fusionar a `master` hasta que confirme.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_telegram_multiples_vinculaciones.sql
git commit -m "feat(db): migration 0017 - telegram_vinculaciones (hasta 3 personas por empresa)"
```

---

### Task TG2: Tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Quitar `telegram_chat_id` de `perfiles_usuarios`**

Reemplazar:

```ts
          perfil_completo:  boolean
          telegram_chat_id:    string | null
          telegram_link_token: string
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['perfiles_usuarios']['Row'], 'created_at' | 'updated_at' | 'telegram_chat_id' | 'telegram_link_token'>
          & { telegram_chat_id?: string | null; telegram_link_token?: string }
        Update: Partial<Database['public']['Tables']['perfiles_usuarios']['Insert']>
        Relationships: []
      }
```

por:

```ts
          perfil_completo:  boolean
          telegram_link_token: string
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['perfiles_usuarios']['Row'], 'created_at' | 'updated_at' | 'telegram_link_token'>
          & { telegram_link_token?: string }
        Update: Partial<Database['public']['Tables']['perfiles_usuarios']['Insert']>
        Relationships: []
      }
```

- [ ] **Step 2: Agregar la tabla `telegram_vinculaciones`**

Insertar después del bloque de `calificaciones` (antes de `token_saldos`):

```ts
      telegram_vinculaciones: {
        Row: {
          id:             string
          usuario_id:     string
          chat_id:        string
          nombre_mostrar: string
          created_at:     string
        }
        Insert: Omit<Database['public']['Tables']['telegram_vinculaciones']['Row'], 'id' | 'created_at'>
        Update: never
        Relationships: []
      }
```

(`Insert` NO es `never` aquí: a diferencia de `calificaciones` — que solo se escribe vía una función `security definer` — el webhook hace un `upsert()` directo con el cliente de servicio, así que el tipo debe permitir construir ese payload.)

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: errores esperados en los archivos que todavía usan `telegram_chat_id` (se corrigen en las tasks siguientes) — confirmar que la lista de errores coincide exactamente con los 5 archivos listados en el contexto de arriba, ninguno más.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(telegram): tipos de telegram_vinculaciones, quita telegram_chat_id"
```

---

### Task TG3: Helpers compartidos + webhook

**Files:**
- Modify: `src/lib/telegram/vinculacion.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`

- [ ] **Step 1: Agregar los helpers en `src/lib/telegram/vinculacion.ts`**

Agregar al final del archivo:

```ts
import { createServiceClient } from '@/lib/supabase/service'

/** Todos los chat_id vinculados de UNA empresa (puede haber hasta 3). */
export async function chatIdsDe(usuarioId: string): Promise<string[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('telegram_vinculaciones')
    .select('chat_id')
    .eq('usuario_id', usuarioId)
  return (data ?? []).map((d) => d.chat_id)
}

/**
 * Los chat_id vinculados de VARIAS empresas a la vez, agrupados por
 * usuario_id — una sola consulta, evita N+1 (usado por la alerta a mi ciudad,
 * que notifica a muchos candidatos de una vez).
 */
export async function chatIdsPorUsuarios(usuarioIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  if (!usuarioIds.length) return mapa

  const service = createServiceClient()
  const { data } = await service
    .from('telegram_vinculaciones')
    .select('usuario_id, chat_id')
    .in('usuario_id', usuarioIds)

  for (const fila of data ?? []) {
    const lista = mapa.get(fila.usuario_id) ?? []
    lista.push(fila.chat_id)
    mapa.set(fila.usuario_id, lista)
  }
  return mapa
}
```

Mover el `import { createServiceClient } ...` arriba, junto a los demás imports del archivo (no al final) — el bloque de arriba lo muestra junto a las funciones nuevas solo por claridad de lectura del plan.

- [ ] **Step 2: Reescribir el webhook completo**

Reemplazar todo `src/app/api/webhooks/telegram/route.ts` por:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notificarTelegram } from '@/lib/telegram/notificar'
import { parseTokenInicio } from '@/lib/telegram/vinculacion'

/**
 * Webhook de Telegram: recibe los updates del bot. Su único trabajo es
 * atender el `/start <token>` que dispara el deep-link de vinculación:
 * resuelve el token a una empresa y guarda el `chat_id` de quien escribió
 * (hasta 3 personas distintas por empresa — el trigger de la BD rechaza la
 * 4ª), para poder enviarle notificaciones después.
 *
 * Registrar una vez (reemplazar <TOKEN> y <SECRET>):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d url="https://www.tasadirecta.com/api/webhooks/telegram" \
 *     -d secret_token="<SECRET>"
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secreto) {
    const recibido = request.headers.get('x-telegram-bot-api-secret-token')
    if (recibido !== secreto) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  let update: {
    message?: {
      text?: string
      chat?: { id?: number }
      from?: { first_name?: string; last_name?: string; username?: string }
    }
  }
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const texto = update.message?.text
  const chatId = update.message?.chat?.id
  const token = parseTokenInicio(texto)

  // Cualquier update que no sea un `/start <token>` válido se ignora (200 para
  // que Telegram no reintente).
  if (!token || chatId == null) {
    return NextResponse.json({ ok: true })
  }

  const supabase = createServiceClient()
  const { data: perfil, error: errorBusqueda } = await supabase
    .from('perfiles_usuarios')
    .select('id')
    .eq('telegram_link_token', token)
    .maybeSingle()

  if (errorBusqueda) {
    console.error('[webhook/telegram] error al buscar el token:', errorBusqueda)
    return NextResponse.json({ ok: true })
  }

  if (!perfil) {
    await notificarTelegram(
      'No encontramos una cuenta con ese enlace. Abra el enlace de vinculación desde su panel en Tasa Directa.',
      String(chatId)
    )
    return NextResponse.json({ ok: true })
  }

  const from = update.message?.from
  const nombreMostrar =
    [from?.first_name, from?.last_name].filter(Boolean).join(' ') ||
    (from?.username ? `@${from.username}` : 'Usuario de Telegram')

  const { error: errorVinculo } = await supabase
    .from('telegram_vinculaciones')
    .upsert(
      { usuario_id: perfil.id, chat_id: String(chatId), nombre_mostrar: nombreMostrar },
      { onConflict: 'usuario_id,chat_id' }
    )

  if (errorVinculo) {
    // El mensaje del trigger de tope (u otro error) ya viene listo para
    // mostrarse tal cual, mismo criterio que el resto del código.
    await notificarTelegram(errorVinculo.message, String(chatId))
    return NextResponse.json({ ok: true })
  }

  await notificarTelegram(
    '✅ <b>Telegram vinculado</b>\nA partir de ahora recibirá aquí los avisos de nuevas intenciones sobre sus ofertas en Tasa Directa.',
    String(chatId)
  )

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: los errores restantes deben ser solo en `ofertas/actions.ts`, `admin/actions.ts`, `dashboard/page.tsx`, `dashboard/telegram-card.tsx` (se corrigen en las tasks siguientes).

- [ ] **Step 4: Commit**

```bash
git add src/lib/telegram/vinculacion.ts src/app/api/webhooks/telegram/route.ts
git commit -m "feat(telegram): helpers chatIdsDe/chatIdsPorUsuarios y webhook multi-persona"
```

---

### Task TG4: Actualizar los 4 puntos que notifican

**Files:**
- Modify: `src/app/ofertas/actions.ts`
- Modify: `src/app/admin/actions.ts`

- [ ] **Step 1: Import nuevo en `src/app/ofertas/actions.ts`**

Reemplazar:

```ts
import { mensajeDesdeError } from '@/lib/ofertas/mensaje-error'
```

por:

```ts
import { mensajeDesdeError } from '@/lib/ofertas/mensaje-error'
import { chatIdsDe, chatIdsPorUsuarios } from '@/lib/telegram/vinculacion'
```

- [ ] **Step 2: `realizarOferta` — notifica a TODOS los chats del dueño**

Reemplazar:

```ts
    // Aviso directo al PCD dueño de la oferta si vinculó su Telegram. El
    // chat_id no es legible por el usuario que responde (RLS), así que se lee
    // con el cliente de servicio.
    const service = createServiceClient()
    const { data: duenoTg } = await service
      .from('perfiles_usuarios')
      .select('telegram_chat_id')
      .eq('id', oferta.usuario_id)
      .single()
    if (duenoTg?.telegram_chat_id && quienResponde) {
      await notificarTelegram(
        `🤝 <b>Nueva intención sobre su oferta</b>\nSu oferta: ${resumenOferta}\n${quienResponde.razon_social} — ${quienResponde.contacto_nombre} · ${quienResponde.contacto_celular} · ${quienResponde.contacto_correo}\n\nEntre a Tasa Directa para ver el detalle.`,
        duenoTg.telegram_chat_id
      )
    }
```

por:

```ts
    // Aviso directo a cada Telegram vinculado del dueño de la oferta (puede
    // haber hasta 3 personas vinculadas por esa empresa).
    if (quienResponde) {
      const chatIdsDueno = await chatIdsDe(oferta.usuario_id)
      await Promise.all(chatIdsDueno.map((chatId) => notificarTelegram(
        `🤝 <b>Nueva intención sobre su oferta</b>\nSu oferta: ${resumenOferta}\n${quienResponde.razon_social} — ${quienResponde.contacto_nombre} · ${quienResponde.contacto_celular} · ${quienResponde.contacto_correo}\n\nEntre a Tasa Directa para ver el detalle.`,
        chatId
      )))
    }
```

- [ ] **Step 3: `aceptarIntencion` — notifica a TODOS los chats de quien respondió**

Reemplazar:

```ts
    // Aviso directo al PCD que respondió, si vinculó su Telegram. El chat_id
    // no es legible por el dueño de la oferta (RLS), así que se lee con el
    // cliente de servicio — mismo patrón que la notificación de intención.
    const service = createServiceClient()
    const { data: respondioTg } = await service
      .from('perfiles_usuarios')
      .select('telegram_chat_id')
      .eq('id', intencion.usuario_id)
      .single()
    if (respondioTg?.telegram_chat_id) {
      await notificarTelegram(
        `✅ <b>Su intención fue aceptada</b>\n${dueno.razon_social} aceptó su respuesta a la oferta: ${resumenOferta}\nContacto: ${dueno.contacto_nombre} · ${dueno.contacto_celular} · ${dueno.contacto_correo}\n\nContáctelos directamente para cerrar la operación.`,
        respondioTg.telegram_chat_id
      )
    }
```

por:

```ts
    // Aviso directo a cada Telegram vinculado de quien respondió.
    const chatIdsRespondio = await chatIdsDe(intencion.usuario_id)
    await Promise.all(chatIdsRespondio.map((chatId) => notificarTelegram(
      `✅ <b>Su intención fue aceptada</b>\n${dueno.razon_social} aceptó su respuesta a la oferta: ${resumenOferta}\nContacto: ${dueno.contacto_nombre} · ${dueno.contacto_celular} · ${dueno.contacto_correo}\n\nContáctelos directamente para cerrar la operación.`,
      chatId
    )))
```

- [ ] **Step 4: `enviarAlertaCiudad` — notifica a TODOS los chats de cada empresa candidata**

Reemplazar:

```ts
  // Se usa el cliente de servicio: hay que leer telegram_chat_id (privado, no
  // expuesto en perfiles_publicos) de OTROS usuarios, y cruzar con membresía
  // activa — ninguna de las dos cosas es visible para un usuario normal vía RLS.
  const service = createServiceClient()
  const [{ data: candidatos }, { data: membresiasActivas }] = await Promise.all([
    service.from('perfiles_usuarios')
      .select('id, razon_social, correo, telegram_chat_id')
      .eq('estado', 'aprobado')
      .in('ciudad', ciudades)
      .neq('id', user.id),
    service.from('membresias').select('usuario_id').eq('estado', 'activa'),
  ])

  const idsConMembresia = new Set((membresiasActivas ?? []).map((m) => m.usuario_id))
  const destinatarios = (candidatos ?? []).filter((c) => idsConMembresia.has(c.id))

  const mensaje = `📍 <b>Nueva necesidad cerca de usted</b>\n${oferta.empresa}: ${resumenOferta}\nEntre a Tasa Directa para responder.`

  await Promise.all(destinatarios.map((d) =>
    d.telegram_chat_id
      ? notificarTelegram(mensaje, d.telegram_chat_id)
      : enviarCorreo({
          to: d.correo,
          subject: 'Nueva necesidad cerca de usted — Tasa Directa',
          html: `<p><strong>${oferta.empresa}</strong>: ${resumenOferta}</p><p>Entre a Tasa Directa para responder.</p>`,
        })
  ))
```

por:

```ts
  // Se usa el cliente de servicio: hay que leer membresía activa de OTROS
  // usuarios, invisible para un usuario normal vía RLS.
  const service = createServiceClient()
  const [{ data: candidatos }, { data: membresiasActivas }] = await Promise.all([
    service.from('perfiles_usuarios')
      .select('id, razon_social, correo')
      .eq('estado', 'aprobado')
      .in('ciudad', ciudades)
      .neq('id', user.id),
    service.from('membresias').select('usuario_id').eq('estado', 'activa'),
  ])

  const idsConMembresia = new Set((membresiasActivas ?? []).map((m) => m.usuario_id))
  const destinatarios = (candidatos ?? []).filter((c) => idsConMembresia.has(c.id))

  const mensaje = `📍 <b>Nueva necesidad cerca de usted</b>\n${oferta.empresa}: ${resumenOferta}\nEntre a Tasa Directa para responder.`

  const chatIdsPorDestinatario = await chatIdsPorUsuarios(destinatarios.map((d) => d.id))

  await Promise.all(destinatarios.map((d) => {
    const chatIds = chatIdsPorDestinatario.get(d.id) ?? []
    return chatIds.length
      ? Promise.all(chatIds.map((chatId) => notificarTelegram(mensaje, chatId)))
      : enviarCorreo({
          to: d.correo,
          subject: 'Nueva necesidad cerca de usted — Tasa Directa',
          html: `<p><strong>${oferta.empresa}</strong>: ${resumenOferta}</p><p>Entre a Tasa Directa para responder.</p>`,
        })
  }))
```

- [ ] **Step 5: `reactivarUsuario` en `src/app/admin/actions.ts`**

Agregar el import junto a los demás:

```ts
import { chatIdsDe } from '@/lib/telegram/vinculacion'
```

Reemplazar:

```ts
  const [{ data: perfilReactivado }, { data: membresia }] = await Promise.all([
    supabase.from('perfiles_usuarios')
      .select('razon_social, nit, correo, telegram_chat_id')
      .eq('id', usuarioId).single(),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', usuarioId).eq('estado', 'activa').maybeSingle(),
  ])

  const vigente = esMembresiaVigente(membresia, fechaColombiaHoy())

  if (perfilReactivado) {
    await notificarReactivacion({
      correo: perfilReactivado.correo,
      razonSocial: perfilReactivado.razon_social ?? 'Su empresa',
      membresiaVigente: vigente,
    })

    if (perfilReactivado.telegram_chat_id) {
      await notificarTelegram(
        `✅ <b>Su cuenta fue reactivada</b>\n${vigente ? 'Su membresía seguía vigente: ya tiene acceso completo al mercado.' : 'Active su membresía para volver a publicar y responder ofertas.'}`,
        perfilReactivado.telegram_chat_id
      )
    }
  }
```

por:

```ts
  const [{ data: perfilReactivado }, { data: membresia }] = await Promise.all([
    supabase.from('perfiles_usuarios')
      .select('razon_social, nit, correo')
      .eq('id', usuarioId).single(),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', usuarioId).eq('estado', 'activa').maybeSingle(),
  ])

  const vigente = esMembresiaVigente(membresia, fechaColombiaHoy())

  if (perfilReactivado) {
    await notificarReactivacion({
      correo: perfilReactivado.correo,
      razonSocial: perfilReactivado.razon_social ?? 'Su empresa',
      membresiaVigente: vigente,
    })

    const chatIds = await chatIdsDe(usuarioId)
    await Promise.all(chatIds.map((chatId) => notificarTelegram(
      `✅ <b>Su cuenta fue reactivada</b>\n${vigente ? 'Su membresía seguía vigente: ya tiene acceso completo al mercado.' : 'Active su membresía para volver a publicar y responder ofertas.'}`,
      chatId
    )))
  }
```

- [ ] **Step 6: Confirmar que no queda ningún rastro de la columna vieja**

Run: `grep -rn "telegram_chat_id" src/`
Expected: sin resultados (0 líneas).

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: los errores restantes deben ser solo en `dashboard/page.tsx` y `dashboard/telegram-card.tsx` (Task TG5).

- [ ] **Step 8: Commit**

```bash
git add src/app/ofertas/actions.ts src/app/admin/actions.ts
git commit -m "feat(telegram): notifica a todos los chats vinculados de cada empresa"
```

---

### Task TG5: Dashboard del PCD — lista de vinculados + desvincular

**Files:**
- Modify: `src/app/dashboard/telegram-card.tsx`
- Create: `src/app/dashboard/boton-desvincular-telegram.tsx`
- Create: `src/app/dashboard/telegram-actions.ts`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Crear `src/app/dashboard/telegram-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type AccionState = { error: string | null }

export async function desvincularTelegram(
  _prev: AccionState,
  formData: FormData
): Promise<AccionState> {
  const vinculacionId = String(formData.get('vinculacionId') ?? '')
  if (!vinculacionId) return { error: 'Solicitud inválida.' }

  const supabase = await createClient()
  const { error } = await supabase.from('telegram_vinculaciones').delete().eq('id', vinculacionId)

  if (error) return { error: 'No se pudo desvincular.' }

  revalidatePath('/dashboard')
  return { error: null }
}
```

(Única exportación del archivo y es `async` — no agregar nada más aquí, ver la lección del contexto de arriba.)

- [ ] **Step 2: Crear `src/app/dashboard/boton-desvincular-telegram.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { desvincularTelegram, type AccionState } from './telegram-actions'

export function BotonDesvincularTelegram({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AccionState, FormData>(desvincularTelegram, { error: null })
  return (
    <form
      action={formAction}
      onSubmit={(e) => { if (!window.confirm('¿Desvincular este Telegram? Esa persona dejará de recibir avisos.')) e.preventDefault() }}
    >
      <input type="hidden" name="vinculacionId" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Desvinculando…' : 'Desvincular'}
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Reescribir `src/app/dashboard/telegram-card.tsx` completo**

```tsx
import QRCode from 'qrcode'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { deepLinkVinculacion } from '@/lib/telegram/vinculacion'
import { BotonDesvincularTelegram } from './boton-desvincular-telegram'

const TOPE_VINCULACIONES = 3

export interface VinculacionTelegram {
  id: string
  nombreMostrar: string
  createdAt: string
}

export async function TelegramCard({
  vinculaciones,
  token,
}: {
  vinculaciones: VinculacionTelegram[]
  token: string | null | undefined
}) {
  // Resiliencia: si aún no hay token (migración 0010 sin aplicar), no se
  // muestra la tarjeta en vez de renderizar un QR inválido.
  if (!token) return null

  const alcanzoTope = vinculaciones.length >= TOPE_VINCULACIONES
  const enlace = deepLinkVinculacion(token)
  const qrSvg = alcanzoTope ? null : await QRCode.toString(enlace, { type: 'svg', margin: 1, width: 148 })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Avisos por Telegram</CardTitle>
        <Send className="size-5 text-primary" />
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {vinculaciones.length > 0 && (
          <div className="grid gap-2">
            <p className="font-medium text-primary">
              {vinculaciones.length} persona{vinculaciones.length > 1 ? 's' : ''} vinculada{vinculaciones.length > 1 ? 's' : ''}
            </p>
            {vinculaciones.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                <span>{v.nombreMostrar} — vinculado el {new Date(v.createdAt).toLocaleDateString('es-CO')}</span>
                <BotonDesvincularTelegram id={v.id} />
              </div>
            ))}
          </div>
        )}

        {alcanzoTope ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
            Ya tiene el máximo de {TOPE_VINCULACIONES} personas vinculadas. Desvincule a alguien para agregar otra.
          </p>
        ) : (
          <>
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Por seguridad, los avisos de Tasa Directa se envían únicamente por
              la app de Telegram — es indispensable tenerla instalada para poder
              vincularse. Si no la tiene en su celular, descárguela primero:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href="https://play.google.com/store/apps/details?id=org.telegram.messenger"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Descargar para Android
              </Button>
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href="https://apps.apple.com/app/telegram-messenger/id686449807"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Descargar para iPhone
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
              <div
                className="mx-auto size-[148px] shrink-0 rounded-md border border-border bg-white p-1 sm:mx-0"
                dangerouslySetInnerHTML={{ __html: qrSvg! }}
              />
              <div className="grid gap-2">
                <p className="text-muted-foreground">
                  {vinculaciones.length > 0 ? (
                    <>Puede vincular hasta {TOPE_VINCULACIONES - vinculaciones.length} persona{TOPE_VINCULACIONES - vinculaciones.length > 1 ? 's' : ''} más de su empresa: escaneen el mismo código o abran el enlace.</>
                  ) : (
                    <>Vincule su cuenta para recibir un aviso al instante cada vez que alguien responda a sus ofertas. Escanee el código con la cámara de su celular, o toque el botón si ya tiene Telegram en este dispositivo, y presione <strong>Iniciar</strong>.</>
                  )}
                </p>
                <Button size="sm" className="w-fit" render={<a href={enlace} target="_blank" rel="noopener noreferrer" />}>
                  {vinculaciones.length > 0 ? 'Vincular otra persona' : 'Vincular mi Telegram'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Por seguridad, la operación es dinero: mantenga sus avisos en un
                  canal privado y no comparta este enlace.
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Traer la lista de vinculaciones en `src/app/dashboard/page.tsx`**

Reemplazar:

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: aceptacionesContrato }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('tipo_documento, estado').eq('usuario_id', user.id),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', user.id).maybeSingle(),
    supabase.from('aceptaciones').select('documento, created_at')
      .eq('usuario_id', user.id).eq('version', VERSION_LEGAL).in('documento', SLUGS_ETAPA_CONTRATO),
  ])
```

por:

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: aceptacionesContrato }, { data: vinculacionesTelegram }] = await Promise.all([
    supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single(),
    supabase.from('documentos_kyc').select('tipo_documento, estado').eq('usuario_id', user.id),
    supabase.from('membresias').select('estado, fecha_inicio, fecha_fin')
      .eq('usuario_id', user.id).eq('estado', 'activa').maybeSingle(),
    supabase.from('token_saldos').select('saldo').eq('usuario_id', user.id).maybeSingle(),
    supabase.from('aceptaciones').select('documento, created_at')
      .eq('usuario_id', user.id).eq('version', VERSION_LEGAL).in('documento', SLUGS_ETAPA_CONTRATO),
    supabase.from('telegram_vinculaciones').select('id, nombre_mostrar, created_at')
      .eq('usuario_id', user.id).order('created_at', { ascending: true }),
  ])
```

Reemplazar:

```tsx
      {perfil.estado === 'aprobado' && (
        <TelegramCard chatId={perfil.telegram_chat_id} token={perfil.telegram_link_token} />
      )}
```

por:

```tsx
      {perfil.estado === 'aprobado' && (
        <TelegramCard
          vinculaciones={(vinculacionesTelegram ?? []).map((v) => ({
            id: v.id,
            nombreMostrar: v.nombre_mostrar,
            createdAt: v.created_at,
          }))}
          token={perfil.telegram_link_token}
        />
      )}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/telegram-card.tsx src/app/dashboard/boton-desvincular-telegram.tsx src/app/dashboard/telegram-actions.ts src/app/dashboard/page.tsx
git commit -m "feat(telegram): dashboard muestra lista de vinculados y permite desvincular"
```

---

### Task TG6: Panel admin — ver y desvincular por empresa

**Files:**
- Create: `src/app/admin/usuarios/[id]/telegram-vinculado.tsx`
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/usuarios/[id]/page.tsx`

- [ ] **Step 1: Agregar `eliminarVinculacionTelegram` en `src/app/admin/actions.ts`**

Agregar justo después de `eliminarCalificacion`:

```ts
export async function eliminarVinculacionTelegram(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const vinculacionId = String(formData.get('vinculacionId') ?? '')
  if (!vinculacionId) return { error: 'Solicitud inválida.' }

  const { error } = await supabase.from('telegram_vinculaciones').delete().eq('id', vinculacionId)
  if (error) return { error: 'No se pudo desvincular.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}
```

- [ ] **Step 2: Crear `src/app/admin/usuarios/[id]/telegram-vinculado.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { eliminarVinculacionTelegram, type AdminState } from '../../actions'

export interface VinculacionTelegramAdmin {
  id: string
  nombreMostrar: string
  createdAt: string
}

function BotonEliminarVinculacion({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(eliminarVinculacionTelegram, { error: null })
  return (
    <form
      action={formAction}
      onSubmit={(e) => { if (!window.confirm('¿Desvincular este Telegram? Esa persona dejará de recibir avisos.')) e.preventDefault() }}
    >
      <input type="hidden" name="vinculacionId" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Desvinculando…' : 'Desvincular'}
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  )
}

export function TelegramVinculado({ vinculaciones }: { vinculaciones: VinculacionTelegramAdmin[] }) {
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-white p-6">
      <h2 className="text-lg font-semibold">Telegram vinculado</h2>
      {vinculaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta empresa aún no ha vinculado ningún Telegram.</p>
      ) : (
        <div className="grid gap-2">
          {vinculaciones.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
              <span>{v.nombreMostrar} — vinculado el {new Date(v.createdAt).toLocaleDateString('es-CO')}</span>
              <BotonEliminarVinculacion id={v.id} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Traer las vinculaciones y montar la sección en `src/app/admin/usuarios/[id]/page.tsx`**

Agregar el import junto a los demás:

```ts
import { TelegramVinculado } from './telegram-vinculado'
```

Reemplazar el array del `Promise.all` (agregar un elemento más al final):

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: movimientos }, { data: aceptaciones }, { data: verificacionIdentidad }, { data: reputacion }, { data: calificacionesRecibidas }] = await Promise.all([
```

por:

```ts
  const [{ data: perfil }, { data: docs }, { data: membresia }, { data: saldoRow }, { data: movimientos }, { data: aceptaciones }, { data: verificacionIdentidad }, { data: reputacion }, { data: calificacionesRecibidas }, { data: vinculacionesTelegram }] = await Promise.all([
```

Y agregar la consulta correspondiente al final de ese mismo `Promise.all` (después de la de `calificaciones`, antes del `])`):

```ts
    supabase.from('telegram_vinculaciones')
      .select('id, nombre_mostrar, created_at')
      .eq('usuario_id', id)
      .order('created_at', { ascending: true }),
```

Insertar la sección justo después de `<Reputacion .../>` (antes de `<GestionComercial`):

```tsx
      {perfil.estado === 'aprobado' && (
        <TelegramVinculado
          vinculaciones={(vinculacionesTelegram ?? []).map((v) => ({
            id: v.id,
            nombreMostrar: v.nombre_mostrar,
            createdAt: v.created_at,
          }))}
        />
      )}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/usuarios/\[id\]/telegram-vinculado.tsx src/app/admin/actions.ts "src/app/admin/usuarios/[id]/page.tsx"
git commit -m "feat(telegram): panel admin puede ver y desvincular telegram por empresa"
```

---

### Task TG7: Verificación final, gating de migración y deploy

**Files:** ninguno nuevo — solo verificación y coordinación de despliegue.

- [ ] **Step 1: Confirmar que no queda ningún rastro de la columna vieja**

Run: `grep -rn "telegram_chat_id" src/`
Expected: sin resultados.

- [ ] **Step 2: Correr toda la suite, INCLUIDO el build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: sin errores de tipos, todos los tests en verde, y el build de Next.js compila sin el error de "Server Actions must be async functions" (la lección de hoy).

- [ ] **Step 3: Avisar a Jaime cuál migración correr — NO fusionar todavía**

Pushear todo a `fase-2-kyc` (no a `master`). Decirle explícitamente: "corre `supabase/migrations/0017_telegram_multiples_vinculaciones.sql`" y esperar confirmación antes de fusionar — si se fusiona antes, cualquier notificación de Telegram en producción fallaría (columna `telegram_chat_id` ya no existiría en el código pero la BD real seguiría sin la tabla nueva).

- [ ] **Step 4: Verificación con scripts (después de que Jaime confirme la migración)**

Con un script Node de un solo uso (service-role, borrado al terminar):
1. Confirmar que `perfiles_usuarios.telegram_chat_id` ya no existe y que `telegram_vinculaciones` sí.
2. Insertar 2 filas de prueba en `telegram_vinculaciones` para el mismo `usuario_id` (simulando 2 personas) → debe funcionar.
3. Insertar una 3ª → debe funcionar (llega al tope).
4. Intentar una 4ª → debe fallar con el mensaje de tope.
5. Confirmar que `chatIdsDe(usuarioId)` devuelve las 3.
6. Eliminar una fila (simulando "Desvincular") → confirmar que ahora se puede insertar una nueva sin problema (el tope se liberó).
7. Limpiar todos los datos de prueba.

- [ ] **Step 5: Merge a `master` y deploy**

Solo después de que el Step 4 pase completo:

```bash
git checkout master
git merge fase-2-kyc --no-edit
git push origin master
git checkout fase-2-kyc
git push origin fase-2-kyc
```

Vercel despliega `master` automáticamente a producción.
