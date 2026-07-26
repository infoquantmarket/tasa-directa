# Sistema de Reputación entre PCD — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que las dos partes de un trato cerrado en el marketplace se califiquen mutuamente (1 a 5 estrellas + comentario opcional), mostrar el promedio de estrellas públicamente para desincentivar el abuso (publicar/ofertar y no cumplir), mientras los comentarios quedan reservados al equipo de cumplimiento para investigar patrones y actuar (advertir, suspender).

**Architecture:** Extensión aditiva del marketplace existente (`ofertas`/`intenciones`). Se agrega una columna snapshot (`interlocutor_id`) a `ofertas` para saber quién fue la contraparte de un trato cerrado, una tabla nueva `calificaciones` para el ledger de calificaciones, una función `security definer` para crearlas con las mismas validaciones de negocio que ya usa el resto del marketplace, una vista pública de solo promedio/conteo, y piezas de UI en el tablero, en "Mis ofertas"/"Mis intenciones", y en el panel admin.

**Tech Stack:** Supabase (Postgres, RLS, funciones `security definer`, triggers), Next.js Server Actions, zod, Vitest, Tailwind + shadcn/ui (Base UI), sin librerías nuevas.

---

## 1. Migración de base de datos

**Crea:** `supabase/migrations/0016_reputacion.sql`

### 1.1 Columna `interlocutor_id` en `ofertas`

```sql
alter table public.ofertas add column if not exists interlocutor_id uuid references public.perfiles_usuarios(id);
```

Snapshot inmutable de la contraparte del trato, análogo a `empresa`/`ciudad`. Se llena únicamente por las funciones de cierre de trato (nunca por el cliente):

- `aceptar_intencion(p_intencion_id)`: al aceptar, además de lo que ya hace, agrega `interlocutor_id = <usuario_id de la intención aceptada>` al `update` de `ofertas`.
- `completar_oferta(p_oferta_id)`: antes de marcar `completada`, lee el `usuario_id` de la intención en `enviada`/`vista` asociada a esa oferta (la única posible, dado que el ciclo de negociación solo permite una intención activa a la vez) y lo graba en `interlocutor_id` junto con el cambio de estado.

Ofertas completadas **antes** de este cambio quedan con `interlocutor_id = null` y simplemente no aparecen como calificables — no se puede reconstruir esa información retroactivamente con certeza.

### 1.2 Tabla `calificaciones`

```sql
create table public.calificaciones (
  id            uuid primary key default gen_random_uuid(),
  oferta_id     uuid not null references public.ofertas(id),
  calificador_id uuid not null references public.perfiles_usuarios(id),
  calificado_id  uuid not null references public.perfiles_usuarios(id),
  estrellas     smallint not null check (estrellas between 1 and 5),
  comentario    text,
  created_at    timestamptz not null default now(),
  unique (oferta_id, calificador_id)
);

alter table public.calificaciones enable row level security;

-- Nadie inserta directo a la tabla: siempre a través de calificar_contraparte().
create policy "calificaciones: sin insert directo" on public.calificaciones
  for insert to authenticated with check (false);

-- Un usuario ve sus propias filas como calificador (para saber que ya calificó),
-- sin ver comentarios ajenos hacia él ni calificaciones de otros tratos.
create policy "calificaciones: propio calificador lee" on public.calificaciones
  for select to authenticated using (calificador_id = auth.uid());

-- El admin lee todo (necesario para investigar abuso).
create policy "calificaciones: admin lee todo" on public.calificaciones
  for select to authenticated using (public.es_admin());

-- Solo el admin puede eliminar una calificación (error de la contraparte).
create policy "calificaciones: admin elimina" on public.calificaciones
  for delete to authenticated using (public.es_admin());

-- Nadie actualiza (inmutable; para corregir se elimina y ya).
```

### 1.3 Función `calificar_contraparte`

```sql
create or replace function public.calificar_contraparte(
  p_oferta_id uuid, p_estrellas smallint, p_comentario text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_dueno uuid;
  v_interlocutor uuid;
  v_estado text;
  v_calificado uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = 'insufficient_privilege';
  end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5 then
    raise exception 'La calificación debe ser entre 1 y 5 estrellas.' using errcode = 'check_violation';
  end if;

  select usuario_id, interlocutor_id, estado into v_dueno, v_interlocutor, v_estado
  from public.ofertas where id = p_oferta_id;

  if v_estado is distinct from 'completada' then
    raise exception 'Solo se puede calificar un trato completado.' using errcode = 'check_violation';
  end if;
  if v_interlocutor is null then
    raise exception 'Este trato no tiene una contraparte registrada para calificar.' using errcode = 'check_violation';
  end if;
  if v_uid <> v_dueno and v_uid <> v_interlocutor then
    raise exception 'No participó en este trato.' using errcode = 'insufficient_privilege';
  end if;

  v_calificado := case when v_uid = v_dueno then v_interlocutor else v_dueno end;

  insert into public.calificaciones (oferta_id, calificador_id, calificado_id, estrellas, comentario)
  values (p_oferta_id, v_uid, v_calificado, p_estrellas, nullif(p_comentario, ''));
end;
$$;
```

Al ser `security definer`, hace el `insert` real esquivando la política `with check (false)` — el mismo patrón que `aceptar_intencion`/`completar_oferta` ya usan para las tablas que protegen.

### 1.4 Vista pública `reputacion_usuarios`

```sql
create or replace view public.reputacion_usuarios as
select
  calificado_id as usuario_id,
  round(avg(estrellas)::numeric, 1) as promedio,
  count(*) as total
from public.calificaciones
group by calificado_id;

grant select on public.reputacion_usuarios to authenticated;
```

Sin fila para una empresa = "Sin calificaciones aún" en la UI. Esta vista NO expone `comentario` ni `calificador_id`, así que es segura para mostrar a cualquier PCD aprobado.

---

## 2. Tipos TypeScript

**Modifica:** `src/types/database.ts`
- `ofertas.Row` gana `interlocutor_id: string | null` (después de `notas`, antes de `destacada`).
- Nueva tabla `calificaciones` con su `Row`/`Insert` (`Insert` no se usa desde el cliente — se hace vía RPC — pero se declara por completitud de tipos).
- Nueva vista `reputacion_usuarios` con `Row: { usuario_id: string; promedio: number; total: number }`.
- Nueva función `calificar_contraparte: { Args: { p_oferta_id: string; p_estrellas: number; p_comentario?: string }; Returns: void }`.

---

## 3. Validación (TDD)

**Crea:** `src/lib/validation/calificacion.ts`

```ts
import { z } from 'zod'

export const calificacionSchema = z.object({
  estrellas: z.coerce.number().int().min(1, 'Debe seleccionar entre 1 y 5 estrellas.').max(5, 'Debe seleccionar entre 1 y 5 estrellas.'),
  comentario: z.string().max(500, 'El comentario no puede superar 500 caracteres.').optional(),
})
```

**Crea:** `tests/validation/calificacion.test.ts` — casos: acepta 1-5, rechaza 0/6/no-numérico, comentario opcional vacío, comentario de más de 500 caracteres se rechaza.

---

## 4. Server Actions

**Crea:** `src/app/ofertas/calificaciones-actions.ts`

- `calificarContraparte(_prev, formData)`: parsea `ofertaId`, `estrellas`, `comentario` con `calificacionSchema`, llama `supabase.rpc('calificar_contraparte', {...})`, traduce errores de Postgres igual que el resto de `actions.ts` (reutiliza el patrón `mensajeDesdeError`), revalida `/ofertas`, `/ofertas/mis-ofertas`, `/ofertas/mis-intenciones`.

**Crea:** `src/lib/ofertas/tratos-por-calificar.ts` — helper de servidor: dado un `usuario_id`, consulta `ofertas` donde `estado = 'completada'` y (`usuario_id = uid` o `interlocutor_id = uid`), hace `left join` (o segunda consulta) contra `calificaciones` filtrando `calificador_id = uid`, y devuelve las que faltan por calificar con los datos mínimos para el banner (empresa contraparte, resumen de la oferta, fecha).

---

## 5. UI

**Modifica:** `src/app/ofertas/tarjeta-oferta.tsx`
- `DatosOferta` gana `reputacion: { promedio: number; total: number } | null`.
- Debajo del nombre de la empresa, un badge de estrellas (ícono `Star` de lucide, relleno proporcional al promedio) + `"4.5 (12)"`, o `"Sin calificaciones aún"` en texto muted si `reputacion` es `null`.

**Modifica:** `src/app/ofertas/page.tsx` — trae `reputacion_usuarios` para las empresas de las ofertas visibles (una consulta `in('usuario_id', [...])`) y arma el mapa que pasa a cada `TarjetaOferta`.

**Crea:** `src/app/ofertas/banner-por-calificar.tsx` (client component) — recibe la lista de tratos pendientes de calificar, muestra una tarjeta por trato con botón "Calificar" que abre un `Dialog` (shadcn) con selector de 1-5 estrellas (botones tipo estrella clickeables) + `Textarea` opcional, y envía `calificarContraparte`.

**Modifica:** `src/app/ofertas/mis-ofertas/page.tsx` y `src/app/ofertas/mis-intenciones/page.tsx` — cada uno llama `tratosPorCalificar(user.id)` y renderiza `<BannerPorCalificar />` arriba de la lista si hay pendientes.

**Crea:** `src/app/admin/usuarios/[id]/reputacion.tsx` (client component) — sección del expediente admin, **colapsada por defecto tipo acordeón** (mismo patrón de disclosure ya usado en `faq-chatbot.tsx`: botón con `ChevronDown` que gira al expandir, sin depender de una librería de acordeón nueva). El encabezado, siempre visible aunque esté colapsada, muestra el promedio + total (p.ej. "★ 4.5 (12 calificaciones)") para que el admin lo vea de un vistazo sin tener que desplegar. Al expandir, se ve la lista completa: cada fila con `estrellas`, `comentario`, quién calificó (`razon_social` del calificador vía join), fecha, y un botón "Eliminar" con confirmación (`window.confirm` o el mismo patrón de `BotonAccionAdmin`) que llama a un server action `eliminarCalificacion(id)`.

**No es una pestaña ni página aparte** — vive dentro del expediente de cada usuario (`/admin/usuarios/[id]`), igual que las secciones de KYC, comercial y suspensión ya existentes, para que el admin tenga todo el contexto de ese PCD en un solo lugar.

**Crea:** server action `eliminarCalificacion(id)` en `src/app/admin/actions.ts` (o archivo de acciones admin existente): hace `supabase.from('calificaciones').delete().eq('id', id)` y revalida la ruta del expediente — la política RLS de `delete` ya restringe esto a admins, así que no hace falta lógica extra de autorización en el action. **Solo elimina, no edita** estrellas ni comentario — si una calificación fue injusta se borra completa, no se corrige su contenido (decisión explícita: evita que el admin reescriba lo que dijo el otro PCD).

**Modifica:** `src/app/admin/usuarios/[id]/page.tsx` — agrega `<Reputacion />` al expediente, junto a las secciones existentes (perfil, comercial, KYC).

---

## 6. Testing y verificación

- `calificacion.test.ts` (Vitest, TDD) para el schema — ver sección 3.
- Verificación manual en navegador (obligatoria antes de dar por completo, dado que toca triggers de Postgres):
  1. Completar un trato de prueba por las dos vías (`aceptar_intencion` y `completar_oferta`) y confirmar que `interlocutor_id` queda bien en ambos casos.
  2. Calificar desde ambos lados, confirmar que el promedio aparece en el tablero para la empresa calificada.
  3. Confirmar que el comentario NO es visible para el otro PCD (ni en el tablero ni en ningún detalle de oferta/intención) pero SÍ aparece completo en el panel admin.
  4. Intentar calificar dos veces el mismo trato desde el mismo usuario → debe fallar (constraint único) con mensaje entendible.
  5. Eliminar una calificación desde el panel admin y confirmar que el promedio público se recalcula.
  6. Confirmar que los flujos existentes (publicar, responder, aceptar, completar, cerrar sin acuerdo) siguen funcionando sin cambios de comportamiento.

## Fuera de alcance

- No se muestra reputación en el detalle de una intención (solo en la tarjeta del tablero, por decisión explícita de Jaime).
- No hay edición de una calificación ya enviada por el usuario (inmutable; solo el admin puede eliminarla).
- No hay notificación por Telegram del recordatorio de calificar (solo banner dentro de la plataforma).
- No hay límite de longitud de historial ni paginación en la vista admin de calificaciones por usuario (volumen bajo esperado en esta etapa).
