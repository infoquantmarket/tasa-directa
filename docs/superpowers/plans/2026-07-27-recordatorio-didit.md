# Recordatorio Didit + alerta "listo para aprobar" — Plan de Implementación

> **Para el ejecutor:** mismo criterio que el plan anterior (0018): sin
> infraestructura de tests para SQL ni para componentes/orquestación con
> DB — solo Vitest para módulos TypeScript puros. La orquestación que toca
> la base (el helper `alertarSiListoParaAprobar`, la ruta del cron, el
> server action del botón) se verifica en vivo en la última tarea.

**Goal:** recordar por correo (cron + botón manual) a quien tiene sus 3
documentos aprobados pero nunca completó la verificación de identidad
Didit, y alertar por Telegram al admin cuando una cuenta queda lista para
el botón "Aprobar PCD", sin importar cuál de las dos cosas (documentos,
identidad) quedó de última.

**Architecture:** ver
`docs/superpowers/specs/2026-07-27-recordatorio-didit-design.md`. Mismo
patrón que 0018 (migration con 2 columnas + 2 funciones security definer,
ruta de cron, módulo de correo con TDD), más: un helper compartido
`alertarSiListoParaAprobar` llamado desde dos puntos (webhook Didit y
aprobación del último documento), y un botón manual que reutiliza
`registrar_recordatorio_didit` — por eso esa función acepta tanto
`service_role` como `es_admin()`, a diferencia de las de 0018.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS + `security
definer`), Resend, Telegram, Vitest, Vercel Cron.

---

### Task RD1: Migration 0019 — columnas y funciones SQL

**Files:**
- Create: `supabase/migrations/0019_recordatorio_didit.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- =============================================================================
-- TASA DIRECTA · Recordatorio de verificación de identidad (Didit) +
-- alerta "listo para aprobar"
-- Segundo punto de abandono del embudo: documentos ya aprobados, pero el
-- representante legal nunca completó (o abandonó) la verificación externa
-- de identidad. Mismo patrón que 0018 (recordatorio de documentos), con su
-- propio contador — más un botón manual en el expediente admin, que
-- comparte el mismo contador que el cron.
-- Idempotente.
-- =============================================================================

-- 1. Columnas de seguimiento --------------------------------------------------
alter table public.perfiles_usuarios
  add column if not exists recordatorios_didit_enviados smallint not null default 0,
  add column if not exists recordatorio_didit_ultimo_envio timestamptz;

-- 2. Candidatos a recordatorio de identidad ------------------------------------
--    Solo service_role (el cron) — igual que usuarios_para_recordatorio_kyc().
create or replace function public.usuarios_para_recordatorio_didit()
returns table (
  usuario_id          uuid,
  correo              text,
  razon_social        text,
  numero_recordatorio smallint
)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id, p.correo, p.razon_social, (p.recordatorios_didit_enviados + 1)::smallint
  from public.perfiles_usuarios p
  where p.estado = 'pendiente'
    and p.rol = 'usuario'
    and p.recordatorios_didit_enviados < 3
    and (
      p.recordatorio_didit_ultimo_envio is null
      or p.recordatorio_didit_ultimo_envio <= now() - interval '3 days'
    )
    and (
      select count(distinct d.tipo_documento)
      from public.documentos_kyc d
      where d.usuario_id = p.id
        and d.tipo_documento in ('rut', 'camara_comercio', 'resolucion_dian')
        and d.estado = 'aprobado'
    ) = 3
    and coalesce(
      (
        select v.estado
        from public.validaciones_identidad v
        where v.usuario_id = p.id
        order by v.created_at desc
        limit 1
      ),
      'Not Started'
    ) in ('Not Started', 'Abandoned', 'Expired', 'Kyc Expired');
end;
$$;

-- 3. Registrar el envío ---------------------------------------------------------
--    A diferencia de registrar_recordatorio_kyc(), este SÍ lo puede llamar un
--    admin autenticado además del cron — lo usa también el botón manual del
--    expediente (mismo contador, mismo tope de 3, sin importar la vía).
--    Mismo patrón que proteger_perfil() (0001_esquema_inicial.sql).
create or replace function public.registrar_recordatorio_didit(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.es_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  update public.perfiles_usuarios
     set recordatorios_didit_enviados = recordatorios_didit_enviados + 1,
         recordatorio_didit_ultimo_envio = now()
   where id = p_usuario_id;
end;
$$;
```

- [ ] **Step 2: Autorrevisión antes de commitear**

Confirmar contra esta checklist:
- Las 2 columnas usan `add column if not exists` (idempotente); las 2
  funciones usan `create or replace function` (idempotente).
- `usuarios_para_recordatorio_didit()` exige `service_role` — nunca debe
  poder llamarla un usuario normal (expone correos de todas las empresas).
- `registrar_recordatorio_didit()` acepta `service_role` **o** `es_admin()`
  — a propósito, porque el botón manual la llama con la sesión propia del
  admin, no con el cliente de servicio.
- El conteo de documentos usa `count(distinct d.tipo_documento)` filtrado a
  los 3 tipos requeridos — un documento duplicado o el opcional
  (`composicion_accionaria`) no puede inflar el conteo.
- El `coalesce(..., 'Not Started')` trata "ninguna fila en
  validaciones_identidad" igual que "nunca la inició".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0019_recordatorio_didit.sql
git commit -m "feat(db): migration 0019 - recordatorio Didit y alerta listo para aprobar"
```

**Nota:** esta migración NO se corre todavía en Supabase — eso pasa en la
Task RD10.

---

### Task RD2: Tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Agregar las 2 columnas al Row de `perfiles_usuarios`**

Justo después de `recordatorio_kyc_ultimo_envio: string | null` (agregado
en la migration 0018):

```ts
          recordatorios_kyc_enviados: number
          recordatorio_kyc_ultimo_envio: string | null
          recordatorios_didit_enviados: number
          recordatorio_didit_ultimo_envio: string | null
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['perfiles_usuarios']['Row'], 'created_at' | 'updated_at' | 'telegram_link_token' | 'recordatorios_kyc_enviados' | 'recordatorio_kyc_ultimo_envio' | 'recordatorios_didit_enviados' | 'recordatorio_didit_ultimo_envio'>
          & { telegram_link_token?: string }
```

- [ ] **Step 2: Agregar los tipos de las 2 funciones nuevas**

Dentro de `Functions` (después de `registrar_recordatorio_kyc`):

```ts
      usuarios_para_recordatorio_didit: {
        Args: Record<never, never>
        Returns: Array<{ usuario_id: string; correo: string; razon_social: string | null; numero_recordatorio: number }>
      }
      registrar_recordatorio_didit: { Args: { p_usuario_id: string }; Returns: void }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(db): tipos TypeScript de recordatorio_didit"
```

---

### Task RD3: Extraer `todosDocumentosAprobados` (TDD)

**Files:**
- Modify: `src/lib/validation/kyc.ts`
- Modify: `tests/validation/kyc.test.ts`

- [ ] **Step 1: Escribir los tests nuevos (fallan primero)**

Agregar en `tests/validation/kyc.test.ts`, después del import (agregar
`todosDocumentosAprobados` a la lista importada) y antes de
`describe('puedeAprobarUsuario', ...)`:

```ts
import {
  TIPOS_DOCUMENTO,
  TODOS_TIPOS_DOCUMENTO,
  ETIQUETAS_DOCUMENTO,
  validarArchivoKyc,
  todosDocumentosAprobados,
  puedeAprobarUsuario,
} from '@/lib/validation/kyc'
```

```ts
describe('todosDocumentosAprobados', () => {
  const docsCompletos = [
    { tipo_documento: 'rut' as const, estado: 'aprobado' as const },
    { tipo_documento: 'camara_comercio' as const, estado: 'aprobado' as const },
    { tipo_documento: 'resolucion_dian' as const, estado: 'aprobado' as const },
  ]

  it('true cuando los 3 documentos requeridos están aprobados', () => {
    expect(todosDocumentosAprobados(docsCompletos)).toBe(true)
  })
  it('false si falta alguno', () => {
    expect(todosDocumentosAprobados(docsCompletos.slice(0, 2))).toBe(false)
  })
  it('false si alguno está rechazado o pendiente', () => {
    const conRechazado = [
      docsCompletos[0],
      { tipo_documento: 'camara_comercio' as const, estado: 'rechazado' as const },
      docsCompletos[2],
    ]
    expect(todosDocumentosAprobados(conRechazado)).toBe(false)
  })
  it('ignora el documento opcional de composición accionaria', () => {
    const conOpcionalPendiente = [
      ...docsCompletos,
      { tipo_documento: 'composicion_accionaria' as const, estado: 'pendiente' as const },
    ]
    expect(todosDocumentosAprobados(conOpcionalPendiente)).toBe(true)
  })
})
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npx vitest run tests/validation/kyc.test.ts`
Expected: FAIL — `todosDocumentosAprobados` no existe todavía.

- [ ] **Step 3: Extraer el helper**

En `src/lib/validation/kyc.ts`, reemplazar la función `puedeAprobarUsuario`
completa por:

```ts
/**
 * true cuando los 3 documentos REQUERIDOS (no el opcional de composición
 * accionaria) están en estado 'aprobado'.
 */
export function todosDocumentosAprobados(
  docs: Array<{ tipo_documento: TipoDoc; estado: EstadoDoc }>
): boolean {
  return TIPOS_DOCUMENTO.every((tipo) =>
    docs.some((d) => d.tipo_documento === tipo && d.estado === 'aprobado')
  )
}

/**
 * La aprobación final del PCD requiere los 3 documentos REQUERIDOS
 * aprobados Y que la verificación de identidad del representante legal
 * (Didit) esté en estado 'Approved'.
 */
export function puedeAprobarUsuario(
  docs: Array<{ tipo_documento: TipoDoc; estado: EstadoDoc }>,
  verificacionIdentidad: { estado: EstadoVerificacionIdentidad } | null | undefined
): boolean {
  return todosDocumentosAprobados(docs) && verificacionIdentidad?.estado === 'Approved'
}
```

- [ ] **Step 4: Correr los tests y confirmar que todos pasan**

Run: `npx vitest run tests/validation/kyc.test.ts`
Expected: PASS (todos, incluyendo los de `puedeAprobarUsuario` ya
existentes — no deben romperse con el refactor).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/kyc.ts tests/validation/kyc.test.ts
git commit -m "refactor(kyc): extrae todosDocumentosAprobados de puedeAprobarUsuario (TDD)"
```

---

### Task RD4: Notificación por correo (TDD)

**Files:**
- Create: `src/lib/notificaciones/recordatorio-didit.ts`
- Test: `tests/notificaciones/recordatorio-didit.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as resendCliente from '@/lib/resend/cliente'
import { notificarRecordatorioDidit } from '@/lib/notificaciones/recordatorio-didit'

describe('notificarRecordatorioDidit', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envía correo con el nombre de la empresa y el enlace a vinculación', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarRecordatorioDidit({
      correo: 'contacto@empresa.com',
      razonSocial: 'Cambios del Valle S.A.S',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'contacto@empresa.com',
        subject: expect.stringContaining('vinculación'),
      })
    )
    const html = spy.mock.calls[0][0].html
    expect(html).toContain('Cambios del Valle S.A.S')
    expect(html).toContain('https://www.tasadirecta.com/vinculacion')
  })

  it('escapa HTML en la razón social', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarRecordatorioDidit({
      correo: 'x@y.com',
      razonSocial: '<script>evil()</script>',
    })

    const html = spy.mock.calls[0][0].html
    expect(html).not.toContain('<script>evil()</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('usa un saludo genérico cuando razón social es null', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarRecordatorioDidit({
      correo: 'x@y.com',
      razonSocial: null,
    })

    const html = spy.mock.calls[0][0].html
    expect(html).toContain('su empresa')
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run tests/notificaciones/recordatorio-didit.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

```ts
import { enviarCorreo } from '@/lib/resend/cliente'

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface NotificarRecordatorioDiditInput {
  correo: string
  /** Null cuando el usuario aún no llenó el perfil de su empresa en /vinculacion. */
  razonSocial: string | null
}

export async function notificarRecordatorioDidit(input: NotificarRecordatorioDiditInput): Promise<void> {
  const razonSocial = escapeHtml(input.razonSocial ?? 'su empresa')

  const html = `
    <h2>Solo falta un paso para completar su vinculación</h2>
    <p>Hola, equipo de <strong>${razonSocial}</strong>.</p>
    <p>Sus documentos ya fueron aprobados. Solo falta que el representante legal complete la verificación de identidad (foto y prueba de vida) para terminar el proceso de vinculación en Tasa Directa.</p>
    <p><a href="https://www.tasadirecta.com/vinculacion">Complete la verificación aquí</a></p>
  `

  await enviarCorreo({
    to: input.correo,
    subject: 'Solo falta un paso para completar su vinculación en Tasa Directa',
    html,
  })
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run tests/notificaciones/recordatorio-didit.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones/recordatorio-didit.ts tests/notificaciones/recordatorio-didit.test.ts
git commit -m "feat(notificaciones): correo de recordatorio Didit (TDD)"
```

---

### Task RD5: Helper `alertarSiListoParaAprobar`

**Files:**
- Create: `src/lib/kyc/listo-para-aprobar.ts`

No lleva test unitario dedicado: es orquestación pura de consultas a la
base (mismo criterio que `revisarDocumento`/`aprobarUsuario`, que tampoco
lo tienen) — se verifica en vivo en la Task RD10. La decisión de negocio
que sí importa (`puedeAprobarUsuario`) ya está probada en
`tests/validation/kyc.test.ts`.

- [ ] **Step 1: Implementar**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { puedeAprobarUsuario } from '@/lib/validation/kyc'
import { notificarTelegram } from '@/lib/telegram/notificar'

/**
 * Se llama desde los dos puntos donde una cuenta puede quedar lista para
 * aprobación (documentos + identidad completos): el webhook de Didit y la
 * aprobación del último documento — cualquiera de los dos puede ser el que
 * falte de último. Si con este cambio ya queda lista, alerta al admin por
 * Telegram (mismo canal fijo que "PCD aprobado" en aprobarUsuario()).
 */
export async function alertarSiListoParaAprobar(
  supabase: SupabaseClient<Database>,
  usuarioId: string
): Promise<void> {
  const [{ data: docs }, { data: verificacion }] = await Promise.all([
    supabase.from('documentos_kyc').select('tipo_documento, estado').eq('usuario_id', usuarioId),
    supabase
      .from('validaciones_identidad')
      .select('estado')
      .eq('usuario_id', usuarioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!puedeAprobarUsuario(docs ?? [], verificacion)) return

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('razon_social, nit, correo')
    .eq('id', usuarioId)
    .single()

  await notificarTelegram(
    `🪪 <b>Listo para aprobar</b>\n${perfil?.razon_social ?? usuarioId}\nNIT: ${perfil?.nit ?? '—'}\nCorreo: ${perfil?.correo ?? '—'}\n➡️ Documentos e identidad completos — puede aprobar la cuenta.`
  )
}
```

- [ ] **Step 2: Verificación de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kyc/listo-para-aprobar.ts
git commit -m "feat(kyc): helper alertarSiListoParaAprobar"
```

---

### Task RD6: Ruta del cron

**Files:**
- Create: `src/app/api/cron/recordatorio-didit/route.ts`

- [ ] **Step 1: Implementar la ruta**

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notificarRecordatorioDidit } from '@/lib/notificaciones/recordatorio-didit'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: candidatos, error } = await supabase.rpc('usuarios_para_recordatorio_didit')

  if (error) {
    console.error('[cron/recordatorio-didit] error al leer candidatos:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let enviados = 0
  for (const candidato of candidatos ?? []) {
    await notificarRecordatorioDidit({
      correo: candidato.correo,
      razonSocial: candidato.razon_social,
    })

    const { error: errorRegistro } = await supabase.rpc('registrar_recordatorio_didit', {
      p_usuario_id: candidato.usuario_id,
    })
    if (errorRegistro) {
      console.error('[cron/recordatorio-didit] error al registrar envío:', errorRegistro)
      continue
    }
    enviados++
  }

  return NextResponse.json({ ok: true, candidatos: candidatos?.length ?? 0, enviados })
}
```

- [ ] **Step 2: Verificación de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/recordatorio-didit/route.ts
git commit -m "feat(cron): ruta GET /api/cron/recordatorio-didit"
```

---

### Task RD7: Segunda entrada en Vercel Cron

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Agregar la entrada**

```json
{
  "crons": [
    { "path": "/api/cron/recordatorio-kyc", "schedule": "0 13 * * *" },
    { "path": "/api/cron/recordatorio-didit", "schedule": "0 13 * * *" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat(cron): agrega Vercel Cron diario para recordatorio Didit"
```

---

### Task RD8: Server action y botón manual en el expediente

**Files:**
- Modify: `src/app/admin/actions.ts`
- Modify: `src/app/admin/usuarios/[id]/page.tsx`

- [ ] **Step 1: Agregar el server action**

En `src/app/admin/actions.ts`, agregar el import (junto a los demás, línea
~8):

```ts
import { notificarRecordatorioDidit } from '@/lib/notificaciones/recordatorio-didit'
```

Y agregar la función al final del archivo:

```ts
export async function enviarRecordatorioDidit(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const { supabase, admin } = await exigirAdmin()
  if (!admin) return { error: 'No autorizado.' }

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!usuarioId) return { error: 'Solicitud inválida.' }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('correo, razon_social')
    .eq('id', usuarioId)
    .single()

  if (!perfil) return { error: 'Usuario no encontrado.' }

  await notificarRecordatorioDidit({ correo: perfil.correo, razonSocial: perfil.razon_social })

  const { error } = await supabase.rpc('registrar_recordatorio_didit', { p_usuario_id: usuarioId })
  if (error) return { error: 'Se envió el correo, pero no se pudo registrar el recordatorio.' }

  revalidatePath('/admin', 'layout')
  return { error: null }
}
```

- [ ] **Step 2: Agregar el botón en el expediente**

En `src/app/admin/usuarios/[id]/page.tsx`:

Agregar `todosDocumentosAprobados` al import existente de `@/lib/validation/kyc`:

```ts
import { ETIQUETAS_DOCUMENTO, TODOS_TIPOS_DOCUMENTO, todosDocumentosAprobados, puedeAprobarUsuario } from '@/lib/validation/kyc'
```

Agregar `enviarRecordatorioDidit` al import existente de `'../../actions'`:

```ts
import { revisarDocumento, aprobarUsuario, rechazarUsuario, reactivarUsuario, enviarRecordatorioDidit } from '../../actions'
```

Después de la línea `const listo = puedeAprobarUsuario(...)`, agregar:

```ts
  const documentosCompletos = todosDocumentosAprobados(
    (docs ?? []).map((d) => ({ tipo_documento: d.tipo_documento, estado: d.estado }))
  )
  const mostrarBotonRecordatorioDidit =
    perfil.estado === 'pendiente' && documentosCompletos && verificacionIdentidad?.estado !== 'Approved'
```

Reemplazar la sección "Verificación de identidad (Didit)" completa por:

```tsx
      <section className="grid gap-3 rounded-lg border border-border bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold">Verificación de identidad (Didit)</h2>
        <div className="flex items-center gap-2 text-sm">
          <span>Representante legal:</span>
          {verificacionIdentidad ? (
            <>
              <EstadoBadge estado={verificacionIdentidad.estado} />
              <span className="text-muted-foreground">
                {new Date(verificacionIdentidad.created_at).toLocaleDateString('es-CO')}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Aún no iniciada</span>
          )}
        </div>
        {mostrarBotonRecordatorioDidit && (
          <BotonAccionAdmin
            accion={enviarRecordatorioDidit}
            campos={{ usuarioId: perfil.id }}
            etiqueta="Enviar recordatorio de identidad"
            etiquetaCargando="Enviando…"
          />
        )}
      </section>
```

- [ ] **Step 3: Verificación de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/actions.ts "src/app/admin/usuarios/[id]/page.tsx"
git commit -m "feat(admin): boton manual de recordatorio de identidad en el expediente"
```

---

### Task RD9: Integrar la alerta "listo para aprobar"

**Files:**
- Modify: `src/app/api/webhooks/didit/route.ts`
- Modify: `src/app/admin/actions.ts`

- [ ] **Step 1: Webhook de Didit**

En `src/app/api/webhooks/didit/route.ts`, agregar el import:

```ts
import { alertarSiListoParaAprobar } from '@/lib/kyc/listo-para-aprobar'
```

Reemplazar el bloque final (desde `const supabase = createServiceClient()`
hasta el `return`) por:

```ts
  const supabase = createServiceClient()
  const { data: actualizado, error } = await supabase
    .from('validaciones_identidad')
    .update({
      estado: estado as never,
      decision: (decision ?? null) as never,
    })
    .eq('session_id', sessionId)
    .select('usuario_id')
    .maybeSingle()

  if (error) {
    console.error('[webhook/didit] no se pudo actualizar validaciones_identidad:', error)
    return NextResponse.json({ ok: true })
  }

  if (estado === 'Approved' && actualizado) {
    await alertarSiListoParaAprobar(supabase, actualizado.usuario_id)
  }

  return NextResponse.json({ ok: true })
```

- [ ] **Step 2: Aprobación de documento**

En `src/app/admin/actions.ts`, agregar el import:

```ts
import { alertarSiListoParaAprobar } from '@/lib/kyc/listo-para-aprobar'
```

Reemplazar el cuerpo de `revisarDocumento` desde el `.update()` de
`documentos_kyc` en adelante por:

```ts
  const { data: docActualizado, error } = await supabase
    .from('documentos_kyc')
    .update({
      estado: decision as 'aprobado' | 'rechazado',
      notas_revision: nota || null,
      revisado_por: admin.id,
      revisado_at: new Date().toISOString(),
    })
    .eq('id', docId)
    .select('usuario_id')
    .single()

  if (error) return { error: 'No se pudo guardar la revisión.' }

  if (decision === 'aprobado' && docActualizado) {
    await alertarSiListoParaAprobar(supabase, docActualizado.usuario_id)
  }

  revalidatePath('/admin', 'layout')
  return { error: null }
```

- [ ] **Step 3: Verificación de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/didit/route.ts src/app/admin/actions.ts
git commit -m "feat(kyc): alerta a Telegram cuando la cuenta queda lista para aprobar"
```

---

### Task RD10: Verificación final, gating de migración y deploy

**Files:** ninguno nuevo.

- [ ] **Step 1: Verificación local completa**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: sin errores en los 3 comandos.

- [ ] **Step 2: Push de la rama de trabajo**

```bash
git push origin fase-2-kyc
```

- [ ] **Step 3: Pedir al usuario que corra la migración**

Mostrar `supabase/migrations/0019_recordatorio_didit.sql` y esperar
confirmación explícita antes de continuar.

- [ ] **Step 4: Verificación en vivo (después de la confirmación)**

Script desechable `_tmp-verificar-recordatorio-didit.mjs`:

```js
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const correo = `recordatorio-didit-test-${Date.now()}@example.com`
  const { data: creado, error: errorCrear } = await supabase.auth.admin.createUser({
    email: correo,
    email_confirm: true,
  })
  if (errorCrear) throw errorCrear
  const usuarioId = creado.user.id
  console.log('Usuario de prueba creado:', usuarioId)

  // Aún sin documentos: NO debe calificar (le falta lo principal, documentos).
  const { data: c0 } = await supabase.rpc('usuarios_para_recordatorio_didit')
  console.log('1. Sin documentos, NO califica (esperado true):', !c0.some((c) => c.usuario_id === usuarioId))

  // Aprueba los 3 documentos requeridos.
  for (const tipo of ['rut', 'camara_comercio', 'resolucion_dian']) {
    await supabase.from('documentos_kyc').insert({
      usuario_id: usuarioId,
      tipo_documento: tipo,
      storage_path: `test/${tipo}.pdf`,
      estado: 'aprobado',
    })
  }

  // Documentos completos, sin verificación de identidad: SÍ debe calificar.
  const { data: c1 } = await supabase.rpc('usuarios_para_recordatorio_didit')
  console.log('2. Documentos completos, sin Didit, SÍ califica (esperado true):', c1.some((c) => c.usuario_id === usuarioId))

  // Envía el recordatorio 3 veces (agota el tope).
  await supabase.rpc('registrar_recordatorio_didit', { p_usuario_id: usuarioId })
  await supabase.rpc('registrar_recordatorio_didit', { p_usuario_id: usuarioId })
  await supabase.rpc('registrar_recordatorio_didit', { p_usuario_id: usuarioId })
  const { data: c2 } = await supabase.rpc('usuarios_para_recordatorio_didit')
  console.log('3. Tras 3 recordatorios, ya NO califica (esperado true):', !c2.some((c) => c.usuario_id === usuarioId))

  // Nota: este insert es directo (service-role), NO pasa por el webhook de
  // Didit — por diseño NO dispara alertarSiListoParaAprobar (esa lógica solo
  // vive en el webhook y en revisarDocumento, no en un insert crudo). Sirve
  // aquí solo para dejar un dato realista antes de leer el contador final.
  await supabase.from('validaciones_identidad').insert({
    usuario_id: usuarioId,
    session_id: `test-session-${Date.now()}`,
    estado: 'Approved',
  })

  const { data: perfilFinal } = await supabase
    .from('perfiles_usuarios')
    .select('recordatorios_didit_enviados')
    .eq('id', usuarioId)
    .single()
  console.log('4. Contador final (esperado 3):', perfilFinal.recordatorios_didit_enviados)

  // Verifica que la función rechaza llamadas anónimas.
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { error: errorAnon } = await anonSupabase.rpc('usuarios_para_recordatorio_didit')
  console.log('5. Rechaza llamada anónima (esperado true):', errorAnon?.message === 'No autorizado.')

  await supabase.auth.admin.deleteUser(usuarioId)
  console.log('Limpieza completa.')
}

main().catch((err) => {
  console.error('ERROR:', err)
  process.exit(1)
})
```

Run: `node _tmp-verificar-recordatorio-didit.mjs`
Expected: las 5 líneas confirman `true`/`3` en cada caso.

Verificar también manualmente (no vía script, para no repetir el envío
real de otro correo de prueba):
- Llamar `POST /api/cron/recordatorio-didit` (o esperar al cron real) con
  el usuario de prueba en el estado correcto, y confirmar que SOLO se
  incrementa `recordatorios_didit_enviados` (no `recordatorios_kyc_enviados`,
  que es un contador distinto).
- Aprobar un documento real de prueba con Didit ya aprobada (o viceversa)
  y confirmar que llega la alerta al Telegram del admin.

Luego borrar el script:
```bash
rm -f _tmp-verificar-recordatorio-didit.mjs
```

**Nota:** a diferencia de la verificación de 0018, aquí NO se prueba la
ruta del cron con `curl` usando el `CRON_SECRET` real contra el servidor
local — eso ejecutaría un envío real contra el mismo `info@surcambios.com`
u otros candidatos reales de la base de producción. Basta con la
verificación de la función SQL (que ya prueba toda la lógica de
candidatos) y una revisión visual del código de la ruta (ya verificada
por `tsc`/`build`), más el 401 sin auth.

- [ ] **Step 5: Verificar el 401 de la ruta (sin ejecutar el envío real)**

```bash
curl -s -o /dev/null -w "sin auth: %{http_code}\n" http://localhost:3000/api/cron/recordatorio-didit
```

Expected: `sin auth: 401`.

- [ ] **Step 6: Merge a master y deploy**

```bash
git checkout master
git merge fase-2-kyc --no-edit
git push origin master
git checkout fase-2-kyc
git push origin fase-2-kyc
```

Vercel despliega `master` automáticamente y registra la segunda entrada de
cron desde `vercel.json`. `CRON_SECRET` ya está configurado en Vercel
desde la pieza anterior — no hace falta ninguna variable nueva.

---

## Autorrevisión del plan (ya aplicada arriba)

- **Cobertura del spec:** las 2 partes del spec (recordatorio Didit +
  alerta "listo para aprobar", incluyendo sus 2 puntos de disparo) tienen
  tarea asignada.
- **Sin placeholders:** cada paso tiene código completo.
- **Consistencia de tipos:** `usuario_id`/`correo`/`razon_social`/
  `numero_recordatorio` iguales en SQL (RD1), tipos (RD2) y ruta (RD6).
  `recordatorios_didit_enviados`/`recordatorio_didit_ultimo_envio` iguales
  en RD1, RD2. `todosDocumentosAprobados` con la misma firma en RD3, RD8 y
  usado indirectamente (vía `puedeAprobarUsuario`) en RD5.
- **Lección de la pieza anterior aplicada:** el test de
  `notificarRecordatorioDidit` incluye el caso `razonSocial: null` desde el
  principio (Task RD4), evitando repetir el bug encontrado en vivo con
  `notificarRecordatorioKyc`.
- **Riesgo de envíos reales durante verificación (lección de la pieza
  anterior):** la Task RD10 evita deliberadamente probar la ruta del cron
  con el `CRON_SECRET` real contra `localhost`, ya que eso golpea la base
  de producción real y puede enviar correos reales — a diferencia de 0018,
  aquí la verificación se apoya solo en la función SQL (vía script con
  usuario de prueba) y el chequeo de 401.
