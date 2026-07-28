# Recordatorio de verificación Didit + alerta "listo para aprobar" — Diseño

**Fecha:** 2026-07-27
**Estado:** Aprobado por el usuario, pendiente de plan de implementación

## Motivación

El sistema de recordatorio KYC ya construido (migration 0018) cubre solo el
primer punto de abandono del embudo: usuarios que nunca subieron ningún
documento. Hay un segundo punto de abandono distinto: usuarios cuyos 3
documentos ya fueron aprobados por el admin, pero el representante legal
nunca completó (o abandonó) la verificación de identidad externa (Didit) —
sin eso, `puedeAprobarUsuario()` nunca se satisface y la cuenta queda
`pendiente` indefinidamente, sin que nadie —ni el usuario ni el admin— reciba
ningún aviso.

Esta pieza agrega dos cosas relacionadas:
1. Un recordatorio por correo al PCD (automático + botón manual), igual que
   el de documentos pero para este segundo punto de abandono.
2. Una alerta a Telegram del admin cuando una cuenta pasa a estar
   completamente lista para el botón "Aprobar PCD" (documentos + identidad).

## Parte 1 — Recordatorio de verificación de identidad

### Criterio

Un usuario califica para el recordatorio de identidad cuando:

1. `perfiles_usuarios.estado = 'pendiente'` y `rol = 'usuario'`.
2. Los 3 documentos requeridos (`rut`, `camara_comercio`, `resolucion_dian`)
   están `aprobado` — si falta alguno, el problema real todavía son los
   documentos, no la identidad, y el correo "solo falta esto" sería falso.
3. El estado más reciente en `validaciones_identidad` (o la ausencia total
   de una fila) es uno de: sin iniciar, abandonada, expirada o "Kyc
   Expired". Deliberadamente **excluidos**: en progreso, en revisión,
   esperando al usuario, rechazada, reenviada — esos casos ya están activos
   o necesitan una revisión distinta a "recuérdele completar el paso".
4. Lleva menos de 3 recordatorios de este tipo enviados.
5. El último (si existe) fue enviado hace ≥3 días.

Mismo ritmo que el recordatorio de documentos (hasta 3, cada 3 días), pero
con su **propio contador separado** — un usuario puede agotar los 3
recordatorios de "suba documentos" y no haber recibido ninguno de
"complete su identidad" (son etapas distintas del mismo embudo). A
diferencia del recordatorio de documentos, este no tiene un umbral mínimo
de "24 horas desde algo": llegar a este estado ya implica que pasó por
revisión humana de 3 documentos, así que no hace falta un período de
gracia adicional antes del primer envío.

### Arquitectura

Mismo patrón que el recordatorio de documentos (migration 0018), en
paralelo:

```
Vercel Cron (diario, 8am Colombia)
  → GET /api/cron/recordatorio-didit  (Bearer CRON_SECRET)
      → RPC usuarios_para_recordatorio_didit()
      → por cada candidato: notificarRecordatorioDidit() vía Resend
      → RPC registrar_recordatorio_didit(usuario_id)

Botón manual en el expediente admin
  → enviarRecordatorioDidit(usuarioId)  (Server Action)
      → notificarRecordatorioDidit() vía Resend
      → RPC registrar_recordatorio_didit(usuario_id)
```

El botón y el cron **comparten el mismo contador** — si el admin ya lo usó
3 veces manualmente, el cron deja de insistir también, y viceversa.

### Cambios de esquema (migration `0019_recordatorio_didit.sql`)

```sql
alter table public.perfiles_usuarios
  add column if not exists recordatorios_didit_enviados smallint not null default 0,
  add column if not exists recordatorio_didit_ultimo_envio timestamptz;
```

### Función `usuarios_para_recordatorio_didit()`

`security definer`, mismo chequeo de `service_role` que
`usuarios_para_recordatorio_kyc()` (expone correos de todas las empresas).
Aplica el criterio de arriba: cuenta de documentos aprobados por
`tipo_documento` distinto (subconsulta), y el estado más reciente de
`validaciones_identidad` (subconsulta `order by created_at desc limit 1`,
con `coalesce(..., 'Not Started')` para tratar "ninguna fila" igual que
"nunca la inició").

### Función `registrar_recordatorio_didit(p_usuario_id uuid)`

Igual patrón que `registrar_recordatorio_kyc()`.

### Botón manual — gating

Aparece en la sección "Verificación de identidad (Didit)" del expediente
admin (`src/app/admin/usuarios/[id]/page.tsx`) **solo cuando**: los 3
documentos están aprobados Y la verificación de identidad no está
`Approved` (sin importar si es "Not Started", "Declined", "In Progress",
etc. — a diferencia del cron, aquí el admin ve el estado completo en la
misma pantalla y decide si tiene sentido enviarlo). Reutiliza el
componente genérico `BotonAccionAdmin` ya existente (mismo patrón que el
botón "Reactivar PCD").

### Correo — `src/lib/notificaciones/recordatorio-didit.ts`

Mismo patrón que `recordatorio-kyc.ts` (escapeHtml, un solo texto para los
3 envíos):

- Asunto: "Solo falta un paso para completar su vinculación en Tasa Directa"
- Cuerpo: sus documentos ya fueron aprobados; solo falta que el
  representante legal complete la verificación de identidad (foto + prueba
  de vida); enlace a `/vinculacion` donde está el botón para iniciarla.

## Parte 2 — Alerta al admin: cuenta lista para aprobar

Cuando una cuenta pasa a cumplir `puedeAprobarUsuario()` (documentos +
identidad completos), el admin recibe una alerta de Telegram —mismo canal
fijo que ya se usa para "PCD aprobado" (`notificarTelegram()` sin
`chatId`, va al `TELEGRAM_CHAT_ID` del admin, no al PCD)— avisando que ya
puede entrar a aprobarla.

### Por qué dos puntos de disparo

Cuál de las dos cosas (documentos, identidad) queda completa **de último**
depende del orden en que pasen — y ambos son casos reales:

- Los documentos ya estaban completos y el PCD termina Didit después → se
  detecta en el webhook `src/app/api/webhooks/didit/route.ts`.
- Didit ya estaba aprobada y el admin aprueba el último documento
  pendiente después → se detecta en `revisarDocumento`
  (`src/app/admin/actions.ts`).

Ambos puntos usan el mismo helper para decidir si "ya está listo", así que
la lógica de negocio no se duplica, solo el punto de disparo.

### Helper compartido — `todosDocumentosAprobados()`

Se extrae de `puedeAprobarUsuario()` (`src/lib/validation/kyc.ts`), que hoy
mezcla el chequeo de documentos con el de identidad en una sola expresión:

```ts
export function todosDocumentosAprobados(docs: Array<{ tipo_documento: TipoDoc; estado: EstadoDoc }>): boolean {
  return TIPOS_DOCUMENTO.every((tipo) =>
    docs.some((d) => d.tipo_documento === tipo && d.estado === 'aprobado')
  )
}

export function puedeAprobarUsuario(docs, verificacionIdentidad): boolean {
  return todosDocumentosAprobados(docs) && verificacionIdentidad?.estado === 'Approved'
}
```

Se reutiliza en 3 lugares: `puedeAprobarUsuario` (ya existente), el gating
del botón manual de la Parte 1, y los dos puntos de disparo de esta alerta.

### Disparo 1 — webhook de Didit

Tras actualizar `validaciones_identidad` con éxito: si el nuevo
`estado === 'Approved'`, se consultan los documentos de ese `usuario_id` y,
si `todosDocumentosAprobados()` es `true`, se envía la alerta.

### Disparo 2 — `revisarDocumento`

Tras aprobar un documento con éxito (`decision === 'aprobado'`): se
consultan todos los documentos del usuario y la verificación de identidad
más reciente; si `todosDocumentosAprobados()` es `true` y esa verificación
es `'Approved'`, se envía la alerta.

### Mensaje

```
🪪 <b>Listo para aprobar</b>
{razonSocial}
NIT: {nit}
Correo: {correo}
➡️ Documentos e identidad completos — puede aprobar la cuenta.
```

### Duplicados — decisión deliberada

No se guarda un flag "ya se avisó". En el flujo normal de la UI, la
transición "todosDocumentosAprobados pasa de false a true" solo puede
ocurrir una vez (un documento aprobado no vuelve a `pendiente` salvo que el
PCD lo reemplace tras un rechazo, lo cual es un caso distinto y legítimo
para volver a avisar). El único escenario de alerta duplicada sería una
segunda verificación Didit aprobada para el mismo usuario, algo
extremadamente raro dado el volumen de la plataforma — y una alerta de más
es inofensiva (no dispara ninguna acción, solo informa). No se justifica
la complejidad de un flag anti-duplicados para este caso.

## Testing

- `notificarRecordatorioDidit`: Vitest, mismo patrón que
  `recordatorio-kyc.test.ts` (contenido del correo, escape de HTML, caso
  `razonSocial: null`).
- `todosDocumentosAprobados` / `puedeAprobarUsuario`: ya existe
  `tests/validation/kyc.test.ts` (verificar, no hace falta reescribir) —
  se ajustan si el archivo actual no cubre ya la extracción del helper.
- Función SQL y rutas: verificación en vivo con script desechable, igual
  que en 0018 (crear usuario de prueba, aprobar sus 3 documentos, dejar
  identidad sin iniciar, confirmar que aparece como candidato; luego subir
  una verificación 'Approved' de prueba y confirmar que deja de calificar
  para el recordatorio Y dispara la alerta de Telegram).
- `npm run build` obligatorio (toca `'use server'` y rutas API).

## Fuera de alcance

- No se re-envía la alerta de "listo para aprobar" si ya se envió una vez
  para esa cuenta (ver "Duplicados" arriba).
- El botón manual no tiene el filtro estrecho de estados Didit que sí tiene
  el cron (Not Started/Abandoned/Expired) — el admin decide con lo que ve
  en pantalla.
- No se modifica `rechazarUsuario` ni `suspenderUsuario` — quedan fuera de
  esta pieza.
