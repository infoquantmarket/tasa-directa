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

## Roadmap por fases

- [x] **Fase 1 — Datos y arquitectura** · esquema SQL, RLS, cuotas, expiración diaria. ⟶ `supabase/migrations/0001_esquema_inicial.sql`
- [ ] **Fase 2 — Admin y KYC** · registro *Pendiente*, carga de documentos, panel de cumplimiento, endpoint de validación de identidad.
- [ ] **Fase 3 — Marketplace y membresías** · reglas de tiers Plus/Premium, edición limitada, borrado lógico.
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
                 ├──(1:N)── membresias    (plus=1/día · premium=3/día · única activa)
                 ├──(1:N)── ofertas ──────(1:N)── intenciones
                 └─(vista) perfiles_publicos      (aceptar_precio · solicitar_contacto)
```

### Reglas codificadas en la base de datos

- **Cuotas diarias por membresía** (trigger sobre `INSERT`): Plus = 1 publicación + 1 intención;
  Premium = 3 + 3. Se cuentan por día en horario Colombia.
- **Eliminar no libera cupo**: el borrado es lógico (`estado='eliminada'`); la cuota
  se cuenta sobre todas las ofertas creadas hoy.
- **Edición limitada**: solo `cantidad` y `precio_cop` son editables. `moneda` y el
  resto de campos son inmutables (trigger `proteger_campos_oferta`).
- **Expiración automática**: `pg_cron` marca `activa → expirada` a las 00:00 Colombia (05:00 UTC).
- **RLS estricto**: cada quien ve lo suyo; el mercado solo muestra ofertas `activa`;
  los documentos KYC y el bucket `kyc-documentos` son privados; contacto público solo
  vía la vista `perfiles_publicos` de PCD aprobados.

> Antes de avanzar a la Fase 2, ver **puntos a validar** en
> [`docs/decisiones-fase-1.md`](docs/decisiones-fase-1.md).
