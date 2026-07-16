# Recuperar Contraseña Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un flujo de "olvidé mi contraseña" al login, reutilizando la infraestructura de correo (Resend/SMTP) y el patrón de verificación de token (`/auth/confirm`) ya existentes.

**Architecture:** `/recuperar` pide el correo y llama a `resetPasswordForEmail` con un `redirectTo` construido explícitamente desde el origin de la request (necesario porque el Site URL de Supabase siempre apunta a producción). El enlace del correo cae en `/auth/confirm?type=recovery`, que ahora se ramifica para mandar a `/restablecer` en vez de `/dashboard`. Ahí el usuario pone la contraseña nueva y, sin pedir login de nuevo, se le redirige según su rol — reutilizando (y extrayendo a un helper compartido) la misma lógica de `iniciarSesion`.

**Tech Stack:** Next.js 16 App Router (Server Actions), TypeScript, Supabase Auth, zod, Vitest.

**Spec:** [`docs/superpowers/specs/2026-07-15-recuperar-contrasena-design.md`](../specs/2026-07-15-recuperar-contrasena-design.md)

---

## Contexto imprescindible para el ejecutor (sin memoria del proyecto)

- **shadcn está sobre Base UI, NO Radix.** No aplica en este plan (no se usa `Button render`), pero si tocas algo con `Link`, recuerda que `Button` no tiene `asChild`.
- **Patrón de preservación de valores tras error de Server Action:** ver `src/app/(auth)/registro/registro-form.tsx` — compara `state !== prevState` en el cuerpo del render (NO en `useEffect`), y un `resetKey` fuerza remount del input para reaplicar `defaultValue`. Los campos de contraseña NUNCA se preservan tras error (mismo criterio ya usado en el registro) — solo el correo, cuando aplica.
- **El Site URL de Supabase siempre apunta a producción** (`www.tasadirecta.com`), no al deployment de Preview actual. Por eso `solicitarRecuperacion` (Task 4) construye `redirectTo` explícitamente a partir de los headers de la request — sin esto, el enlace de recuperación probado en Preview llevaría a producción (rama `master`, sin este código) y el flujo fallaría silenciosamente.
- **Nunca reveles si un correo existe:** `solicitarRecuperacion` siempre redirige a la misma página de confirmación, ignorando si Supabase realmente encontró la cuenta.
- Verificación estándar del proyecto: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`.
- El proyecto ya tiene otros helpers pequeños con test dedicado en `src/lib/http/` (ver `src/lib/http/ip.ts` y `tests/http/ip.test.ts`) — este plan sigue el mismo patrón para el nuevo helper de origin.

## File Structure

- **Create** `src/lib/validation/recuperar.ts` — schemas `solicitarRecuperacionSchema` y `restablecerSchema`.
- **Create** `tests/validation/recuperar.test.ts` — tests de los dos schemas.
- **Create** `src/lib/http/origin.ts` — helper puro `construirOrigin`.
- **Create** `tests/http/origin.test.ts` — tests del helper.
- **Modify** `src/app/auth/confirm/route.ts` — ramifica por `type === 'recovery'`.
- **Modify** `src/app/(auth)/actions.ts` — agrega `solicitarRecuperacion`, `actualizarContrasena`, y extrae el helper compartido `destinoInicioSesion` (usado también por `iniciarSesion`, ya existente).
- **Create** `src/app/(auth)/recuperar/page.tsx` — formulario para pedir el correo.
- **Create** `src/app/(auth)/recuperar/recuperar-form.tsx` — client form.
- **Create** `src/app/(auth)/recuperar/enviado/page.tsx` — confirmación estática ("revise su correo").
- **Create** `src/app/(auth)/restablecer/page.tsx` — formulario para poner la contraseña nueva.
- **Create** `src/app/(auth)/restablecer/restablecer-form.tsx` — client form.
- **Modify** `src/app/(auth)/login/login-form.tsx` — agrega el enlace "¿Olvidó su contraseña?".

---

### Task 1: Validación con zod (TDD)

**Files:**
- Create: `src/lib/validation/recuperar.ts`
- Test: `tests/validation/recuperar.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/validation/recuperar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { solicitarRecuperacionSchema, restablecerSchema } from '@/lib/validation/recuperar'

describe('solicitarRecuperacionSchema', () => {
  it('acepta un correo válido', () => {
    expect(solicitarRecuperacionSchema.safeParse({ correo: 'a@b.com' }).success).toBe(true)
  })

  it('rechaza un correo con formato inválido', () => {
    expect(solicitarRecuperacionSchema.safeParse({ correo: 'no-es-correo' }).success).toBe(false)
  })
})

describe('restablecerSchema', () => {
  it('acepta contraseñas de 8+ caracteres que coinciden', () => {
    const r = restablecerSchema.safeParse({ password: '12345678', confirmar: '12345678' })
    expect(r.success).toBe(true)
  })

  it('rechaza contraseñas de menos de 8 caracteres', () => {
    const r = restablecerSchema.safeParse({ password: '123', confirmar: '123' })
    expect(r.success).toBe(false)
  })

  it('rechaza cuando la confirmación no coincide', () => {
    const r = restablecerSchema.safeParse({ password: '12345678', confirmar: 'distinta1' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['confirmar'])
    }
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/validation/recuperar.test.ts`
Expected: FAIL — «Cannot find module '@/lib/validation/recuperar'».

- [ ] **Step 3: Crear `src/lib/validation/recuperar.ts`**

```ts
import { z } from 'zod'

export const solicitarRecuperacionSchema = z.object({
  correo: z.string().email('Correo electrónico inválido'),
})

export const restablecerSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  })

export type SolicitarRecuperacionInput = z.infer<typeof solicitarRecuperacionSchema>
export type RestablecerInput = z.infer<typeof restablecerSchema>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/validation/recuperar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/recuperar.ts tests/validation/recuperar.test.ts
git commit -m "feat(auth): schemas de validación para recuperar contraseña (TDD)"
```

---

### Task 2: Helper de origin para el redirectTo (TDD)

**Files:**
- Create: `src/lib/http/origin.ts`
- Test: `tests/http/origin.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`tests/http/origin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { construirOrigin } from '@/lib/http/origin'

const H = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null })

describe('construirOrigin', () => {
  it('usa el host y x-forwarded-proto de la request', () => {
    const origin = construirOrigin(H({ host: 'tasa-directa-abc123.vercel.app', 'x-forwarded-proto': 'https' }))
    expect(origin).toBe('https://tasa-directa-abc123.vercel.app')
  })

  it('usa https por defecto si falta x-forwarded-proto', () => {
    expect(construirOrigin(H({ host: 'localhost:3000' }))).toBe('https://localhost:3000')
  })

  it('cae a www.tasadirecta.com si falta la cabecera host', () => {
    expect(construirOrigin(H({}))).toBe('https://www.tasadirecta.com')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- tests/http/origin.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Crear `src/lib/http/origin.ts`**

```ts
/**
 * Origin absoluto de la request actual, para construir `redirectTo` en
 * enlaces de correo (recuperación de contraseña). El Site URL configurado
 * en el dashboard de Supabase siempre apunta a producción — sin este origin
 * explícito, un enlace generado en Preview mandaría al usuario a producción
 * (rama master, que no tiene este código).
 */
export function construirOrigin(headerList: { get(name: string): string | null }): string {
  const host = headerList.get('host') ?? 'www.tasadirecta.com'
  const proto = headerList.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- tests/http/origin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/origin.ts tests/http/origin.test.ts
git commit -m "feat(auth): helper construirOrigin para el redirectTo de recuperar contraseña (TDD)"
```

---

### Task 3: Ramificar `/auth/confirm` para `type=recovery`

**Files:**
- Modify: `src/app/auth/confirm/route.ts`

Contenido actual completo del archivo:

```ts
import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirect('/dashboard')
    }
  }

  redirect('/login?error=confirmacion')
}
```

- [ ] **Step 1: Modificar la línea de redirect tras verificar el token**

Reemplazar:

```ts
    if (!error) {
      redirect('/dashboard')
    }
```

por:

```ts
    if (!error) {
      redirect(type === 'recovery' ? '/restablecer' : '/dashboard')
    }
```

El resto del archivo (imports, manejo de token inválido) queda igual.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/confirm/route.ts
git commit -m "feat(auth): /auth/confirm redirige a /restablecer cuando type=recovery"
```

---

### Task 4: Server actions — solicitar y ejecutar el restablecimiento

**Files:**
- Modify: `src/app/(auth)/actions.ts`

Contenido actual completo del archivo (tal como quedó tras el fix de login-por-rol de esta misma sesión):

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registroSchema } from '@/lib/validation/registro'
import { notificarTelegram } from '@/lib/telegram/notificar'

export type AuthState = { error: string | null; valores?: Record<string, string> }

function valoresDesdeFormData(formData: FormData): Record<string, string> {
  return {
    correo: String(formData.get('correo') ?? ''),
  }
}

export async function registrarse(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registroSchema.safeParse({
    correo: formData.get('correo'),
    password: formData.get('password'),
    confirmar: formData.get('confirmar'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, valores: valoresDesdeFormData(formData) }
  }

  const { correo, password } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({ email: correo, password })

  if (error) {
    return {
      error: 'No se pudo completar el registro. Verifique el correo o intente más tarde.',
      valores: valoresDesdeFormData(formData),
    }
  }

  await notificarTelegram(`🆕 <b>Nueva cuenta creada</b>\nCorreo: ${correo}`)

  redirect('/registro/confirmar')
}

export async function iniciarSesion(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const correo = String(formData.get('correo') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!correo || !password) return { error: 'Ingrese su correo y contraseña.' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Su correo aún no está confirmado. Revise su bandeja de entrada.' }
    }
    return { error: 'Credenciales incorrectas.' }
  }

  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', data.user.id)
    .single()

  revalidatePath('/', 'layout')
  redirect(perfil?.rol === 'admin' ? '/admin' : '/dashboard')
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
```

- [ ] **Step 1: Agregar los imports nuevos**

Al inicio del archivo, después de los imports existentes:

```ts
import { headers } from 'next/headers'
import { solicitarRecuperacionSchema, restablecerSchema } from '@/lib/validation/recuperar'
import { construirOrigin } from '@/lib/http/origin'
```

- [ ] **Step 2: Extraer el helper compartido `destinoInicioSesion`**

Justo antes de `export async function iniciarSesion`, agregar:

```ts
async function destinoInicioSesion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<'/admin' | '/dashboard'> {
  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', userId)
    .single()
  return perfil?.rol === 'admin' ? '/admin' : '/dashboard'
}
```

- [ ] **Step 3: Actualizar `iniciarSesion` para usar el helper**

Reemplazar:

```ts
  const { data: perfil } = await supabase
    .from('perfiles_usuarios')
    .select('rol')
    .eq('id', data.user.id)
    .single()

  revalidatePath('/', 'layout')
  redirect(perfil?.rol === 'admin' ? '/admin' : '/dashboard')
}
```

por:

```ts
  const destino = await destinoInicioSesion(supabase, data.user.id)

  revalidatePath('/', 'layout')
  redirect(destino)
}
```

- [ ] **Step 4: Agregar `solicitarRecuperacion` (después de `iniciarSesion`, antes de `cerrarSesion`)**

```ts
export async function solicitarRecuperacion(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = solicitarRecuperacionSchema.safeParse({
    correo: formData.get('correo'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, valores: valoresDesdeFormData(formData) }
  }

  const supabase = await createClient()
  const headerList = await headers()
  const origin = construirOrigin(headerList)

  // Se ignora el resultado a propósito: la respuesta al usuario es la misma
  // exista o no la cuenta, para no revelar qué correos están registrados.
  await supabase.auth.resetPasswordForEmail(parsed.data.correo, {
    redirectTo: `${origin}/auth/confirm`,
  })

  redirect('/recuperar/enviado')
}

export type RestablecerState = { error: string | null }

export async function actualizarContrasena(
  _prev: RestablecerState,
  formData: FormData
): Promise<RestablecerState> {
  const parsed = restablecerSchema.safeParse({
    password: formData.get('password'),
    confirmar: formData.get('confirmar'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: 'No se pudo actualizar la contraseña. Intente de nuevo.' }
  }

  const destino = await destinoInicioSesion(supabase, user.id)

  revalidatePath('/', 'layout')
  redirect(destino)
}
```

- [ ] **Step 5: Verificar tipos, lint y tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sin errores nuevos; todos los tests existentes siguen pasando (no se modificó ningún test en este task).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/actions.ts"
git commit -m "feat(auth): server actions solicitarRecuperacion y actualizarContrasena; extrae destinoInicioSesion"
```

---

### Task 5: Página `/recuperar` (pedir el correo) + confirmación

**Files:**
- Create: `src/app/(auth)/recuperar/recuperar-form.tsx`
- Create: `src/app/(auth)/recuperar/page.tsx`
- Create: `src/app/(auth)/recuperar/enviado/page.tsx`

- [ ] **Step 1: Crear `src/app/(auth)/recuperar/recuperar-form.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { solicitarRecuperacion, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    solicitarRecuperacion,
    { error: null }
  )

  const [resetKey, setResetKey] = useState(0)
  const [prevState, setPrevState] = useState(state)

  if (state !== prevState) {
    setPrevState(state)
    if (state.error) {
      setResetKey((k) => k + 1)
    }
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <Label htmlFor="correo" className="mb-1.5 block">Correo</Label>
        <Input
          key={`correo-${resetKey}`}
          id="correo"
          name="correo"
          type="email"
          placeholder="contacto@suempresa.co"
          required
          defaultValue={state.valores?.correo ?? ''}
          autoComplete="email"
        />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Enviando…' : 'Enviar enlace de recuperación'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: Crear `src/app/(auth)/recuperar/page.tsx`**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RecuperarForm } from './recuperar-form'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function RecuperarPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Recuperar contraseña</CardTitle>
            <CardDescription>
              Ingrese el correo de su cuenta y le enviaremos un enlace para
              poner una contraseña nueva.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RecuperarForm />
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Volver a iniciar sesión
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
```

- [ ] **Step 3: Crear `src/app/(auth)/recuperar/enviado/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MailCheck } from 'lucide-react'

export const metadata: Metadata = { title: 'Revise su correo' }

export default function RecuperarEnviadoPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-24">
        <Card className="text-center">
          <CardHeader className="items-center">
            <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <MailCheck className="h-6 w-6 text-primary" />
            </span>
            <CardTitle>Revise su correo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Si el correo está registrado, le enviamos un enlace para poner una
            contraseña nueva. El enlace expira después de un tiempo por
            seguridad.
          </CardContent>
        </Card>
      </main>
    </>
  )
}
```

- [ ] **Step 4: Verificar tipos y build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; `/recuperar` y `/recuperar/enviado` aparecen en la lista de rutas.

- [ ] **Step 5: Commit**

```bash
git add src/app/(auth)/recuperar
git commit -m "feat(auth): página /recuperar para solicitar el enlace de restablecimiento"
```

---

### Task 6: Página `/restablecer` (poner la contraseña nueva)

**Files:**
- Create: `src/app/(auth)/restablecer/restablecer-form.tsx`
- Create: `src/app/(auth)/restablecer/page.tsx`

- [ ] **Step 1: Crear `src/app/(auth)/restablecer/restablecer-form.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { actualizarContrasena, type RestablecerState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function RestablecerForm() {
  const [state, formAction, pending] = useActionState<RestablecerState, FormData>(
    actualizarContrasena,
    { error: null }
  )

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña nueva (mínimo 8 caracteres)</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="new-password"
        />
      </div>
      <div>
        <Label htmlFor="confirmar" className="mb-1.5 block">Confirmar contraseña nueva</Label>
        <Input
          id="confirmar"
          name="confirmar"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="new-password"
        />
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Guardando…' : 'Guardar contraseña nueva'}
      </Button>
    </form>
  )
}
```

Nota: a diferencia de `RegistroForm`/`RecuperarForm`, este form NO necesita el
patrón `resetKey`/`prevState` — no hay ningún campo de texto (no-contraseña)
cuyo valor deba preservarse tras un error, y los campos de contraseña nunca
se preservan (mismo criterio que el registro).

- [ ] **Step 2: Crear `src/app/(auth)/restablecer/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from '@/components/site-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RestablecerForm } from './restablecer-form'

export const metadata: Metadata = { title: 'Poner contraseña nueva' }

export default async function RestablecerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Ponga su contraseña nueva</CardTitle>
            <CardDescription>
              Elija una contraseña nueva para su cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RestablecerForm />
          </CardContent>
        </Card>
      </main>
    </>
  )
}
```

El guard `if (!user) redirect('/login')` cubre el caso de acceder a
`/restablecer` directamente sin una sesión de recuperación activa (por
ejemplo, un enlace ya usado o expirado que de todas formas cayó aquí).

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores; `/restablecer` aparece en la lista de rutas.

- [ ] **Step 4: Commit**

```bash
git add src/app/(auth)/restablecer
git commit -m "feat(auth): página /restablecer para poner la contraseña nueva"
```

---

### Task 7: Enlace en el login + verificación final + docs

**Files:**
- Modify: `src/app/(auth)/login/login-form.tsx`
- Modify: `README.md`

Contenido actual completo de `login-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { iniciarSesion, type AuthState } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginForm({ errorInicial }: { errorInicial?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    iniciarSesion,
    { error: errorInicial ?? null }
  )

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <Label htmlFor="correo" className="mb-1.5 block">Correo</Label>
        <Input id="correo" name="correo" type="email" required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 1: Agregar el import de `Link` y el enlace debajo del campo de contraseña**

Agregar al inicio, junto a los demás imports:

```tsx
import Link from 'next/link'
```

Reemplazar:

```tsx
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {state.error && (
```

por:

```tsx
      <div>
        <Label htmlFor="password" className="mb-1.5 block">Contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
        <p className="mt-1.5 text-right text-sm">
          <Link href="/recuperar" className="text-primary hover:underline">
            ¿Olvidó su contraseña?
          </Link>
        </p>
      </div>
      {state.error && (
```

- [ ] **Step 2: Verificación completa**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: tsc limpio; lint limpio; build OK incluyendo `/recuperar`, `/recuperar/enviado`, `/restablecer`; todos los tests pasan (incluidos los 8 nuevos de este plan: 5 de `recuperar.test.ts` + 3 de `origin.test.ts`).

- [ ] **Step 3: Verificación en navegador (preview tools)**

Levantar el dev server (`preview_start` con el nombre de `.claude/launch.json`) y comprobar:
1. `/login` muestra el enlace "¿Olvidó su contraseña?" debajo de la contraseña.
2. Clic en el enlace lleva a `/recuperar`.
3. Enviar el formulario de `/recuperar` con cualquier correo (exista o no) redirige a `/recuperar/enviado` con el mismo mensaje.
4. Acceder directamente a `/restablecer` sin sesión redirige a `/login`.

(El flujo completo de clic-en-el-enlace-del-correo no es verificable sin
disparar un correo real — se prueba manualmente en Preview con una cuenta
real, igual que se hizo para la confirmación de registro.)

- [ ] **Step 4: Actualizar `README.md`**

Agregar, en la sección donde se documenta la autenticación (o cerca del
roadmap), una línea breve: el login incluye recuperación de contraseña vía
`/recuperar` → correo → `/restablecer`, reutilizando `/auth/confirm` con
`type=recovery`.

- [ ] **Step 5: Commit y push**

```bash
git add "src/app/(auth)/login/login-form.tsx" README.md
git commit -m "feat(auth): enlace de recuperar contraseña en el login; documentación"
git push
```

- [ ] **Step 6: Confirmar deploy de Preview**

Confirmar que el nuevo Preview de Vercel construyó OK. Recordar a Jaime usar
el alias fijo de rama para probar (`tasa-directa-git-fase-2-kyc-quant-market-s-projects.vercel.app`),
que siempre apunta al último deploy — evita el problema de caché en URLs
únicas por deployment que causó confusión en la sesión anterior.

---

## Self-Review

- **Cobertura del spec:** `/recuperar` con mensaje uniforme (Task 5) ✓; `redirectTo` explícito vía `construirOrigin` (Task 2, usado en Task 4) ✓; ramificación de `/auth/confirm` por `type=recovery` (Task 3) ✓; `/restablecer` con guard de sesión y redirect por rol sin pedir login de nuevo (Task 6, helper compartido en Task 4) ✓; enlace en el login (Task 7) ✓; validación zod con TDD (Task 1) ✓; fuera de alcance — login normal y confirmación de registro sin cambios de comportamiento (solo se extrajo un helper interno en Task 4, sin alterar su lógica) ✓.
- **Placeholders:** ninguno — todo el código está completo en cada step.
- **Consistencia de tipos:** `AuthState` se reutiliza para `solicitarRecuperacion` (igual que `registrarse`/`iniciarSesion`); `RestablecerState` es un tipo nuevo y más simple (sin `valores`) porque `actualizarContrasena` nunca preserva campos de contraseña. `destinoInicioSesion` se define una vez en Task 4 y se usa desde `iniciarSesion` (modificado) y `actualizarContrasena` (nuevo) con la misma firma. `construirOrigin` y `solicitarRecuperacionSchema`/`restablecerSchema` se definen en Tasks 1-2 y se importan sin cambios de nombre en Task 4.
