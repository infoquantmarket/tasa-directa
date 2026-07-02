# Fase 1 — Decisiones y puntos a validar

Estas son las decisiones de diseño que tomé para dejar el esquema listo. Confírmalas
o corrígelas antes de que despache la Fase 2.

## Decisiones tomadas

1. **Tabla extra `intenciones`.** Además de las 4 tablas que listaste, agregué
   `intenciones` para modelar la acción "Realizar Oferta / Validar Oferta" (Fase 4) y
   disparar la notificación por correo (Fase 5). Es la contraparte de `ofertas`.

2. **Borrado lógico de ofertas.** "Si elimina su publicación, pierde el cupo de ese día"
   ⇒ no se puede borrar físicamente la fila (perderíamos el conteo). Eliminar =
   `estado='eliminada'`. La cuota se cuenta sobre **todas** las ofertas creadas hoy.

3. **Campos editables.** Interpreté "solo monto y precio" como `cantidad` + `precio_cop`.
   `moneda`, `empresa`, `sede`, `operacion` y `condiciones` quedan inmutables tras crear.
   → *¿`condiciones` debería ser editable? Ahora mismo NO lo es.*

4. **Membresías y cuota.** Sin membresía activa ⇒ límite diario = 0 (no puede publicar
   ni hacer intenciones). Solo se permite **una** membresía `activa` por usuario.
   → **CONFIRMADO (2026-07-02): no hay tier gratuito.** Publicar siempre requiere
   Plus o Premium. El esquema ya lo cumple.

5. **Zona horaria.** Todas las cuotas y la expiración usan `America/Bogota` (UTC-5,
   Colombia no aplica horario de verano). El cron corre a las **05:00 UTC**.

6. **Contacto en el modal.** El teléfono/WhatsApp/correo del creador se exponen vía la
   vista `perfiles_publicos` (solo PCD aprobados) a cualquier usuario **autenticado**.
   → *¿Quieres que el contacto solo sea visible tras registrar la intención, en vez de
   ser visible para todo autenticado?*

7. **Campo `operacion` (compra/venta).** Lo agregué como opcional porque un marketplace
   cambiario suele necesitar dirección de la necesidad. → *¿Lo mantenemos y lo hacemos
   obligatorio, o lo quitamos?*

## Preguntas abiertas para ti

- ¿El **precio** es unitario (COP por 1 unidad de divisa) o total? Asumí **unitario**
  (`precio_cop`, ej. 3570 COP por USD).
- Lista de **monedas** habilitadas: dejé USD, EUR, GBP, CAD, MXN, CHF, AUD, JPY.
  ¿Ajustamos?
- ¿Un usuario puede hacer **varias intenciones sobre la misma oferta** (dentro de su
  cuota) o solo una por oferta?
