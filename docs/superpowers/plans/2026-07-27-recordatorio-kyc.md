# Recordatorio automático de documentación KYC — Plan de Implementación

> **Para el ejecutor:** este plan se ejecuta tarea por tarea, en orden, con
> commit al final de cada una. No hay infraestructura de tests para SQL ni
> para componentes React en este proyecto — solo se usa Vitest para módulos
> TypeScript puros (validaciones, notificaciones). Las funciones SQL se
> verifican con un script Node desechable contra la base real, en la última
> tarea, después de que el usuario corra la migración.

**Goal:** enviar hasta 3 correos (cada 3 días, empezando 24h después del
registro) a usuarios que se registraron pero nunca subieron ningún
documento KYC, recordándoles completar `/vinculacion`. Disparado por un
Vercel Cron diario.

**Architecture:** 2 columnas nuevas en `perfiles_usuarios` para rastrear
cuántos recordatorios van y cuándo fue el último. Dos funciones SQL
`security definer` (candidatos + registrar envío), ambas restringidas a
`service_role` porque exponen correos de todas las empresas. Una ruta
`GET /api/cron/recordatorio-kyc` protegida por `CRON_SECRET`, invocada por
Vercel Cron, que llama la RPC de candidatos, envía el correo con el cliente
Resend ya existente, y marca cada envío. Ver
`docs/superpowers/specs/2026-07-27-recordatorio-kyc-design.md` para el
diseño completo ya aprobado.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS +
`security definer`), Resend, Vitest, Vercel Cron (`vercel.json`).

---

### Task RK1: Migration 0018 — columnas y funciones SQL

**Files:**
- Create: `supabase/migrations/0018_recordatorio_kyc.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- =============================================================================
-- TASA DIRECTA · Recordatorio automático de documentación KYC
-- Usuarios que se registraron pero nunca subieron ningún documento reciben
-- hasta 3 correos (cada 3 días, empezando 24h después del registro)
-- recordándoles completar /vinculacion. Disparado por Vercel Cron diario.
-- Idempotente.
-- =============================================================================

-- 1. Columnas de seguimiento en perfiles_usuarios --------------------------------
alter table public.perfiles_usuarios
  add column if not exists recordatorios_kyc_enviados smallint not null default 0,
  add column if not exists recordatorio_kyc_ultimo_envio timestamptz;

-- 2. Candidatos a recordatorio ----------------------------------------------------
--    A diferencia de las demás funciones security definer del proyecto (pensadas
--    para que cualquier usuario autenticado las llame, limitando qué puede hacer
--    cada quien con auth.uid()), esta expone correo y razón social de TODAS las
--    empresas — nunca debe poder llamarla un usuario normal. Mismo patrón de
--    chequeo que proteger_perfil() (0001_esquema_inicial.sql): solo service_role.
create or replace function public.usuarios_para_recordatorio_kyc()
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
  select p.id, p.correo, p.razon_social, (p.recordatorios_kyc_enviados + 1)::smallint
  from public.perfiles_usuarios p
  where p.estado = 'pendiente'
    and p.rol = 'usuario'
    and p.created_at <= now() - interval '24 hours'
    and p.recordatorios_kyc_enviados < 3
    and (
      p.recordatorio_kyc_ultimo_envio is null
      or p.recordatorio_kyc_ultimo_envio <= now() - interval '3 days'
    )
    and not exists (
      select 1 from public.documentos_kyc d where d.usuario_id = p.id
    );
end;
$$;

-- 3. Registrar el envío -------------------------------------------------------------
create or replace function public.registrar_recordatorio_kyc(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  update public.perfiles_usuarios
     set recordatorios_kyc_enviados = recordatorios_kyc_enviados + 1,
         recordatorio_kyc_ultimo_envio = now()
   where id = p_usuario_id;
end;
$$;
```

- [ ] **Step 2: Autorrevisión antes de commitear**

Releer el archivo y confirmar contra esta checklist:
- Las 2 columnas usan `add column if not exists` (idempotente).
- Las 2 funciones usan `create or replace function` (idempotente, no hace
  falta `drop` previo).
- Ambas funciones revisan `auth.role() = 'service_role'` ANTES de tocar
  cualquier dato — sin esto, cualquier usuario autenticado podría llamar
  `usuarios_para_recordatorio_kyc()` desde el navegador y leer correos de
  otras empresas.
- El `not exists` contra `documentos_kyc` no filtra por `estado` del
  documento — cualquier documento subido (aunque esté rechazado) saca al
  usuario de la lista, que es la intención (ya "envió su documentación").

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0018_recordatorio_kyc.sql
git commit -m "feat(db): migration 0018 - recordatorio automatico de documentacion KYC"
```

**Nota:** esta migración NO se corre todavía en Supabase — eso pasa en la
Task RK7, después de que todo el código esté listo y verificado localmente.

---

### Task RK2: Tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Agregar las 2 columnas al Row de `perfiles_usuarios`**

En `src/types/database.ts`, dentro de `perfiles_usuarios.Row` (línea ~66,
justo después de `telegram_link_token: string`):

```ts
          telegram_link_token: string
          recordatorios_kyc_enviados: number
          recordatorio_kyc_ultimo_envio: string | null
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['perfiles_usuarios']['Row'], 'created_at' | 'updated_at' | 'telegram_link_token' | 'recordatorios_kyc_enviados' | 'recordatorio_kyc_ultimo_envio'>
          & { telegram_link_token?: string }
```

Igual que `interlocutor_id` en `ofertas` (solo lo escribe una función SQL,
nunca el cliente), estas 2 columnas quedan excluidas del `Insert` — y como
`Update` es `Partial<...['Insert']>`, también quedan excluidas de ahí
automáticamente.

- [ ] **Step 2: Agregar los tipos de las 2 funciones nuevas**

Dentro de `Functions` (después de `calificar_contraparte`):

```ts
      usuarios_para_recordatorio_kyc: {
        Args: Record<never, never>
        Returns: Array<{ usuario_id: string; correo: string; razon_social: string; numero_recordatorio: number }>
      }
      registrar_recordatorio_kyc: { Args: { p_usuario_id: string }; Returns: void }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(db): tipos TypeScript de recordatorio_kyc"
```

---

### Task RK3: Notificación por correo (TDD)

**Files:**
- Create: `src/lib/notificaciones/recordatorio-kyc.ts`
- Test: `tests/notificaciones/recordatorio-kyc.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as resendCliente from '@/lib/resend/cliente'
import { notificarRecordatorioKyc } from '@/lib/notificaciones/recordatorio-kyc'

describe('notificarRecordatorioKyc', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envía correo con el nombre de la empresa y el enlace a vinculación', async () => {
    const spy = vi.spyOn(resendCliente, 'enviarCorreo').mockResolvedValue(undefined)

    await notificarRecordatorioKyc({
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

    await notificarRecordatorioKyc({
      correo: 'x@y.com',
      razonSocial: '<script>evil()</script>',
    })

    const html = spy.mock.calls[0][0].html
    expect(html).not.toContain('<script>evil()</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run tests/notificaciones/recordatorio-kyc.test.ts`
Expected: FAIL — no existe el módulo `@/lib/notificaciones/recordatorio-kyc`.

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

export interface NotificarRecordatorioKycInput {
  correo: string
  razonSocial: string
}

export async function notificarRecordatorioKyc(input: NotificarRecordatorioKycInput): Promise<void> {
  const razonSocial = escapeHtml(input.razonSocial)

  const html = `
    <h2>Complete su vinculación en Tasa Directa</h2>
    <p>Hola, equipo de <strong>${razonSocial}</strong>.</p>
    <p>Notamos que aún no ha cargado su documentación (RUT, Cámara de Comercio y Resolución DIAN) en Tasa Directa. Sin estos documentos no podemos aprobar su cuenta, y no podrá conectar con otros Profesionales de Cambio, publicar ofertas ni responder a las de sus colegas.</p>
    <p><a href="https://www.tasadirecta.com/vinculacion">Complete su vinculación aquí</a></p>
  `

  await enviarCorreo({
    to: input.correo,
    subject: 'Complete su vinculación en Tasa Directa',
    html,
  })
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run tests/notificaciones/recordatorio-kyc.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones/recordatorio-kyc.ts tests/notificaciones/recordatorio-kyc.test.ts
git commit -m "feat(notificaciones): correo de recordatorio KYC (TDD)"
```

---

### Task RK4: Ruta del cron

**Files:**
- Create: `src/app/api/cron/recordatorio-kyc/route.ts`

- [ ] **Step 1: Implementar la ruta**

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notificarRecordatorioKyc } from '@/lib/notificaciones/recordatorio-kyc'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: candidatos, error } = await supabase.rpc('usuarios_para_recordatorio_kyc')

  if (error) {
    console.error('[cron/recordatorio-kyc] error al leer candidatos:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let enviados = 0
  for (const candidato of candidatos ?? []) {
    await notificarRecordatorioKyc({
      correo: candidato.correo,
      razonSocial: candidato.razon_social,
    })

    const { error: errorRegistro } = await supabase.rpc('registrar_recordatorio_kyc', {
      p_usuario_id: candidato.usuario_id,
    })
    if (errorRegistro) {
      console.error('[cron/recordatorio-kyc] error al registrar envío:', errorRegistro)
      continue
    }
    enviados++
  }

  return NextResponse.json({ ok: true, candidatos: candidatos?.length ?? 0, enviados })
}
```

Nota: esta ruta NO lleva `'use server'` (ese directive es solo para Server
Actions; los Route Handlers de `route.ts` no lo usan y no están sujetos a
la regla de "todos los exports deben ser async" que rompió el build hace
unos días).

- [ ] **Step 2: Verificación de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/recordatorio-kyc/route.ts
git commit -m "feat(cron): ruta GET /api/cron/recordatorio-kyc"
```

---

### Task RK5: Configuración de Vercel Cron

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Crear el archivo**

```json
{
  "crons": [
    { "path": "/api/cron/recordatorio-kyc", "schedule": "0 13 * * *" }
  ]
}
```

`0 13 * * *` = 13:00 UTC = 8:00am Colombia (Colombia no usa horario de
verano, así que no cambia en el año).

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat(cron): programa Vercel Cron diario para recordatorio KYC"
```

---

### Task RK6: Visibilidad en el panel admin

**Files:**
- Modify: `src/app/admin/usuarios/[id]/perfil-empresa.tsx`

- [ ] **Step 1: Agregar el bloque condicional**

En `src/app/admin/usuarios/[id]/perfil-empresa.tsx`, dentro del
`CardContent`, después del bloque "Persona de contacto" (antes del cierre
`</CardContent>`):

```tsx
        {perfil.recordatorios_kyc_enviados > 0 && (
          <div className="grid gap-3">
            <h4 className="text-sm font-semibold">Recordatorio de documentación</h4>
            <p className="text-sm text-muted-foreground">
              {perfil.recordatorios_kyc_enviados}/3 enviados
              {perfil.recordatorio_kyc_ultimo_envio && (
                <> · último: {new Date(perfil.recordatorio_kyc_ultimo_envio).toLocaleDateString('es-CO')}</>
              )}
            </p>
          </div>
        )}
```

El componente ya recibe `perfil` completo (`select('*')` en
`src/app/admin/usuarios/[id]/page.tsx`), así que no hace falta ninguna
consulta nueva — las 2 columnas ya vienen en el objeto.

- [ ] **Step 2: Verificación de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/usuarios/[id]/perfil-empresa.tsx"
git commit -m "feat(admin): muestra recordatorios KYC enviados en el expediente"
```

(Se usan comillas porque `[id]` son caracteres especiales de glob en bash.)

---

### Task RK7: Verificación final, gating de migración y deploy

**Files:** ninguno nuevo — solo verificación, coordinación con el usuario y deploy.

- [ ] **Step 1: Verificación local completa**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: los 3 comandos terminan sin errores (el `npm run build` es
obligatorio porque esta tarea agregó una ruta API — lección aprendida esta
semana con el build break de Server Actions).

- [ ] **Step 2: Push de la rama de trabajo**

```bash
git push origin fase-2-kyc
```

- [ ] **Step 3: Pedir al usuario que corra la migración**

Mostrar al usuario el contenido de
`supabase/migrations/0018_recordatorio_kyc.sql` y pedirle que lo ejecute en
el SQL Editor de Supabase. **Esperar confirmación explícita antes de
continuar** — igual que con las migraciones 0016 y 0017 anteriores.

- [ ] **Step 4: Verificación en vivo (después de la confirmación)**

Escribir un script desechable `_tmp-verificar-recordatorio-kyc.mjs` en la
raíz del repo:

```js
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const correo = `recordatorio-test-${Date.now()}@example.com`
  const { data: creado, error: errorCrear } = await supabase.auth.admin.createUser({
    email: correo,
    email_confirm: true,
  })
  if (errorCrear) throw errorCrear
  const usuarioId = creado.user.id
  console.log('Usuario de prueba creado:', usuarioId)

  // Simula que el registro fue hace 2 días (el trigger fija created_at = now())
  const hace2Dias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('perfiles_usuarios').update({ created_at: hace2Dias }).eq('id', usuarioId)

  const { data: c1 } = await supabase.rpc('usuarios_para_recordatorio_kyc')
  console.log('1. Aparece como candidato (esperado true):', c1.some((c) => c.usuario_id === usuarioId))

  await supabase.from('documentos_kyc').insert({
    usuario_id: usuarioId,
    tipo_documento: 'rut',
    storage_path: 'test/fake.pdf',
  })
  const { data: c2 } = await supabase.rpc('usuarios_para_recordatorio_kyc')
  console.log('2. Ya NO aparece tras subir 1 doc (esperado true):', !c2.some((c) => c.usuario_id === usuarioId))

  await supabase.from('documentos_kyc').delete().eq('usuario_id', usuarioId)

  await supabase.rpc('registrar_recordatorio_kyc', { p_usuario_id: usuarioId })
  await supabase.rpc('registrar_recordatorio_kyc', { p_usuario_id: usuarioId })
  await supabase.rpc('registrar_recordatorio_kyc', { p_usuario_id: usuarioId })
  const { data: c3 } = await supabase.rpc('usuarios_para_recordatorio_kyc')
  console.log('3. Ya NO aparece tras 3 recordatorios (esperado true):', !c3.some((c) => c.usuario_id === usuarioId))

  const { data: perfilFinal } = await supabase
    .from('perfiles_usuarios')
    .select('recordatorios_kyc_enviados, recordatorio_kyc_ultimo_envio')
    .eq('id', usuarioId)
    .single()
  console.log('4. Contador final (esperado 3):', perfilFinal.recordatorios_kyc_enviados)

  await supabase.auth.admin.deleteUser(usuarioId)
  console.log('Limpieza completa.')
}

main()
```

Run: `node _tmp-verificar-recordatorio-kyc.mjs`
Expected: las 4 líneas impresas confirman `true`/`3` en cada caso.

Luego borrar el script:
```bash
rm -f _tmp-verificar-recordatorio-kyc.mjs
```

- [ ] **Step 5: Verificar el rechazo/aceptación de la ruta del cron**

Con el servidor local corriendo (`npm run dev`) y `CRON_SECRET` puesto en
`.env.local`:

```bash
curl -s -o /dev/null -w "sin auth: %{http_code}\n" http://localhost:3000/api/cron/recordatorio-kyc
curl -s -o /dev/null -w "con auth: %{http_code}\n" http://localhost:3000/api/cron/recordatorio-kyc -H "Authorization: Bearer TU_CRON_SECRET_LOCAL"
```

Expected: `sin auth: 401`, `con auth: 200`.

- [ ] **Step 6: Configurar `CRON_SECRET` en Vercel**

Recordar al usuario:
1. Generar un valor real (ej. `openssl rand -hex 32`).
2. Agregarlo como variable de entorno `CRON_SECRET` en el proyecto de
   Vercel, en **Production** (Vercel Cron solo corre ahí).

- [ ] **Step 7: Merge a master y deploy**

```bash
git checkout master
git merge fase-2-kyc --no-edit
git push origin master
git checkout fase-2-kyc
git push origin fase-2-kyc
```

Vercel despliega `master` automáticamente, y con `vercel.json` presente
registra el cron diario al desplegar.

---

## Autorrevisión del plan (ya aplicada arriba)

- **Cobertura del spec:** los 7 requisitos del spec (criterio de atascado,
  arquitectura cron+RPC, columnas de seguimiento, seguridad de las
  funciones, vercel.json, correo, visibilidad admin, testing) tienen tarea
  asignada.
- **Sin placeholders:** cada paso tiene código completo, no hay "TBD" ni
  "similar a la tarea anterior".
- **Consistencia de tipos:** `usuario_id`/`correo`/`razon_social`/
  `numero_recordatorio` se usan igual en la función SQL (RK1), el tipo
  TypeScript (RK2) y la ruta del cron (RK4). `recordatorios_kyc_enviados`/
  `recordatorio_kyc_ultimo_envio` se usan igual en RK1, RK2 y RK6.
