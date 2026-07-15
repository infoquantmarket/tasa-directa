# Recuperar contraseña — Design

**Fecha:** 2026-07-15
**Estado:** Aprobado por Jaime, listo para plan de implementación.

## Contexto

El login (`/login`) no tiene forma de recuperar la contraseña si el usuario la
olvida — ni PCD ni admin. Jaime lo detectó probando el flujo admin en la Fase
2.7. Es una pieza estándar de cualquier login en producción.

## Objetivo

Agregar un flujo de recuperación de contraseña, reutilizando la
infraestructura de correo (Resend/SMTP) y el patrón de verificación de token
(`/auth/confirm`) ya existentes — sin introducir nada nuevo que configurar.

## Enfoque elegido

**Reutilizar `/auth/confirm`**, ramificando por `type`. Supabase's
`verifyOtp()` soporta `type: 'recovery'` igual que `type: 'email'`
(confirmación de registro). Hoy esa ruta SIEMPRE redirige a `/dashboard` tras
verificar el token; se ramifica para que `recovery` vaya a una página nueva de
"poner contraseña nueva" en vez de al dashboard.

Alternativa descartada: una ruta de verificación separada
(`/auth/recuperar-confirm`) — duplicaría la lógica de `verifyOtp()` sin
ninguna ventaja.

## Piezas

### 1. `/recuperar` (nueva, pública)

Página con un formulario de un solo campo (correo). Server action
`solicitarRecuperacion(prev, formData)`:
- Valida el correo con zod (reutilizar el schema de email ya usado en
  `registroSchema`, o un schema mínimo `z.string().email()`).
- Llama a `supabase.auth.resetPasswordForEmail(correo, { redirectTo:
  '<origin>/auth/confirm' })`.
- **Siempre** responde con el mismo mensaje de éxito, exista o no la cuenta:
  *"Si el correo está registrado, le enviamos un enlace para restablecer su
  contraseña."* — no se revela si un correo existe en el sistema (evita
  enumeración de cuentas).
- **Importante (corregido tras autorrevisión):** el registro actual
  (`registrarse` en `src/app/(auth)/actions.ts`) NO pasa `emailRedirectTo` —
  depende enteramente del Site URL configurado en el dashboard de Supabase,
  que **siempre apunta a producción** (`www.tasadirecta.com`). No existe hoy
  ningún mecanismo en código que reescriba esa URL; el bug de confirmación
  de una fase anterior se resolvió con un ajuste manual puntual, no con una
  solución de código. Si `solicitarRecuperacion` tampoco pasa `redirectTo`
  explícito, el enlace de recuperación probado en Preview apuntaría a
  producción (rama `master`, sin este código) y el flujo se rompería para
  cualquier prueba antes del merge.
  **Por eso esta función SÍ debe construir `redirectTo` explícitamente**,
  usando el origin de la request actual: `const headerList = await headers()`,
  tomar `host` (y `x-forwarded-proto`, con `https` por defecto) para armar
  `${proto}://${host}/auth/confirm`, y pasarlo como
  `resetPasswordForEmail(correo, { redirectTo })`. Así el enlace funciona
  correctamente tanto en Preview como en producción, sin intervención manual.

### 2. `/auth/confirm` (modificar)

Archivo: `src/app/auth/confirm/route.ts`. Hoy:
```ts
const { error } = await supabase.auth.verifyOtp({ type, token_hash })
if (!error) redirect('/dashboard')
```
Cambia a: si `type === 'recovery'` y `verifyOtp` no da error, redirigir a
`/restablecer` en vez de `/dashboard`. Cualquier otro `type` (`email`,
`magiclink`, etc.) mantiene el comportamiento actual (`/dashboard`). Un token
inválido/expirado sigue cayendo en `/login?error=confirmacion` (mensaje ya
existente, se reutiliza).

### 3. `/restablecer` (nueva)

Solo accesible con una sesión de recuperación activa (la que deja
`verifyOtp` al procesar el enlace). Si no hay sesión, `redirect('/login')`.

Formulario: contraseña nueva + confirmar (mismas reglas que el registro: zod,
mínimo 8 caracteres, deben coincidir). Server action `actualizarContrasena`:
- Valida con zod.
- `supabase.auth.updateUser({ password })`.
- Tras éxito, consulta `perfiles_usuarios.rol` del usuario (mismo patrón que
  `iniciarSesion`) y redirige a `/admin` si es admin, o `/dashboard` si no —
  **sin pedir login de nuevo** (decisión de Jaime: ir directo a la cuenta).

### 4. Enlace en el login

`src/app/(auth)/login/login-form.tsx`: agregar "¿Olvidó su contraseña?" como
link a `/recuperar`, debajo del campo de contraseña.

## Validación (zod)

Nuevo archivo `src/lib/validation/recuperar.ts` (mismo patrón que
`registro.ts`, `perfil.ts`, `kyc.ts` — un archivo de validación por dominio),
TDD:
- `solicitarRecuperacionSchema`: `{ correo: z.string().email() }`.
- `restablecerSchema`: `{ password: z.string().min(8), confirmar: z.string()
  }.refine(...)` — mismo patrón que `registroSchema`.

## Manejo de errores

- Correo inválido en `/recuperar` → error de validación estándar (mismo
  patrón visual que el resto de formularios del proyecto).
- Token de recuperación inválido/expirado → `/login?error=confirmacion`
  (mensaje ya existente, sin cambios).
- Contraseña nueva no cumple mínimo o no coincide → error de validación en
  `/restablecer`, mismo patrón de preservación de estado (`useActionState`)
  que el resto de formularios.
- Acceso a `/restablecer` sin sesión de recuperación → redirect a `/login`
  (no hay nada que mostrar).

## Testing

- Tests unitarios (Vitest) para los dos schemas nuevos, siguiendo TDD como el
  resto del proyecto.
- El envío real de correo y el flujo completo de clic-en-enlace no son
  testeables por unit test — se verifica manualmente en Preview, mismo
  patrón que se usó para validar la confirmación de registro.

## Fuera de alcance

- No se cambia nada del flujo de confirmación de registro (`type: 'email'`)
  ni de login normal — ambos quedan exactamente igual.
- No se agrega rate-limiting propio: Supabase ya limita `resetPasswordForEmail`
  por defecto.
