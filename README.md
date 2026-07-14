# Tasa Directa

Marketplace **B2B** para el sector cambiario en Colombia — [www.tasadirecta.com](https://www.tasadirecta.com)

> **Mantra de producto:** *Seguridad y Confianza.*

---

## Reglas de oro del negocio (obligatorias para todo el equipo)

1. **Terminología legal estricta.** NUNCA usar "casas de cambio". Los usuarios son
   **Profesionales de Compra y Venta de Divisas (PCD)** autorizados por la DIAN.
2. **Rol de la plataforma.** Tasa Directa es un **marketplace B2B**, **NO ejecuta ni
   liquida transacciones**. Solo conecta oferta y demanda.
3. **Diseño UI/UX.** Interfaz pulida, institucional y moderna. Fondo **claro**
   (blancos y grises muy suaves) con acentos en **tonos verdes** (confianza, dinero,
   crecimiento). Tailwind CSS + componentes tipo shadcn/ui. Nada de diseños básicos.

## Stack

| Capa            | Tecnología                                             |
| --------------- | ------------------------------------------------------ |
| Front + Back    | Next.js (App Router) sobre Node.js                     |
| Datos / Auth    | Supabase — PostgreSQL, Auth, **RLS**, Storage          |
| Correos         | Resend (transaccionales)                               |
| Despliegue      | Vercel (Fluid Compute) conectado a GitHub              |

## Modelo comercial (decisión 2026-07-14)

Suscripción única **`estandar`** (acceso total al mercado, **sin cuotas diarias**) +
**billetera de tokens** para servicios de atención (destacar oferta, alertas premium,
oferta urgente, republicación — se activan en fase de crecimiento, cuando haya
tráfico suficiente para que la atención sea escasa). Cobro **por empresa (NIT)**, no
por sede, vía [Bold](docs/arquitectura-pagos-bold.md). Reemplaza el modelo de tiers
Plus/Premium con cuotas diarias descrito originalmente en la Fase 1 — ver
[`docs/decisiones-fase-1.md`](docs/decisiones-fase-1.md) para el historial de esa
decisión.

## Roadmap por fases

- [x] **Fase 1 — Datos y arquitectura** · esquema SQL, RLS, expiración diaria. ⟶ `supabase/migrations/0001_esquema_inicial.sql`
- [x] **Fase 2 — Admin y KYC** · registro *Pendiente*, carga de documentos, panel de cumplimiento, endpoint de validación de identidad.
- [x] **Fase 2.5 — Modelo comercial** · suscripción única + billetera de tokens, gestión comercial en el panel admin, arquitectura de pagos Bold. ⟶ `supabase/migrations/0003_modelo_comercial.sql`
- [ ] **Fase 3 — Marketplace** · publicación de ofertas, edición limitada, borrado lógico, sedes múltiples por empresa.
- [ ] **Fase 4 — UI del marketplace** · tarjeta de oferta y modal "Realizar Oferta".
- [ ] **Fase 5 — Notificaciones y DevOps** · Resend + despliegue en Vercel.

## Fase 1 — Cómo aplicar el esquema

1. Crea el proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor** y pega el contenido de
   [`supabase/migrations/0001_esquema_inicial.sql`](supabase/migrations/0001_esquema_inicial.sql).
   Si `pg_cron` no está disponible, actívalo en **Database → Extensions** y vuelve a correr.
3. Crea el usuario administrador (sección 9 del script) y promuévelo a `rol='admin'`.

## Modelo de datos (Fase 1)

```
auth.users
   └─(1:1)─ perfiles_usuarios ──(1:N)── documentos_kyc
                 │                        (rut · camara_comercio · resolucion_dian)
                 ├──(1:N)── membresias    (tipo único 'estandar' · sin cuotas · única activa)
                 ├─(1:1)── token_saldos ──(1:N)── token_movimientos  (ledger inmutable)
                 ├──(1:N)── ofertas ──────(1:N)── intenciones
                 └─(vista) perfiles_publicos      (aceptar_precio · solicitar_contacto)
```

### Reglas codificadas en la base de datos

- **Acceso al mercado sin cuotas** (trigger sobre `INSERT` en ofertas/intenciones):
  requiere PCD aprobado + membresía `estandar` activa (`tiene_membresia_activa()`).
  Sin membresía activa, el acceso es 0 — no hay tier gratuito.
- **Tokens**: `token_saldos`/`token_movimientos` solo se escriben vía las funciones
  `SECURITY DEFINER` `otorgar_tokens` (admin) y `consumir_tokens` (autoservicio,
  atómica con lock de fila) — el cliente nunca escribe el saldo directamente.
- **Eliminar no libera cupo**: el borrado de ofertas es lógico (`estado='eliminada'`).
- **Edición limitada**: solo `cantidad` y `precio_cop` son editables. `moneda` y el
  resto de campos son inmutables (trigger `proteger_campos_oferta`).
- **Expiración automática**: `pg_cron` marca `activa → expirada` a las 00:00 Colombia (05:00 UTC).
- **RLS estricto**: cada quien ve lo suyo; el mercado solo muestra ofertas `activa`;
  los documentos KYC y el bucket `kyc-documentos` son privados; contacto público solo
  vía la vista `perfiles_publicos` de PCD aprobados.

> Antes de avanzar a la Fase 2, ver **puntos a validar** en
> [`docs/decisiones-fase-1.md`](docs/decisiones-fase-1.md).
