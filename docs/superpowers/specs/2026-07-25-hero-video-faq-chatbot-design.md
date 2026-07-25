# Video de fondo en el Hero + Chatbot de FAQ — Design

**Goal:** Hacer el hero de la landing menos plano con un video de fondo, y agregar un widget de preguntas frecuentes en la esquina de la página para reducir consultas repetitivas de soporte.

**Architecture:** Dos cambios independientes y de bajo riesgo, sin tocar backend/DB. El video es un cambio visual dentro de `landing-hero.tsx`. El FAQ es un componente cliente nuevo + un archivo de datos JSON/TS, montado en el layout raíz para que aparezca en todo el sitio.

**Tech Stack:** Next.js App Router, React (client components), Tailwind, framer-motion (ya usado en el proyecto), sin librerías nuevas.

---

## 1. Video de fondo en el Hero

**Archivo:** `public/video_tasa.mp4` (ya provisto por el usuario, 7.7 MB).

**Modifica:** `src/app/landing-hero.tsx`, sección `<section className="relative overflow-hidden">`.

- Reemplaza los dos `motion.div` con blobs difuminados por un `<video>` de fondo:
  ```tsx
  <video
    aria-hidden
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
  >
    <source src="/video_tasa.mp4" type="video/mp4" />
  </video>
  ```
- Encima, una capa de overlay para legibilidad del texto (blanco/oscuro sobre verde institucional):
  ```tsx
  <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/90 via-primary/70 to-primary/40" />
  ```
- El texto del hero (badge, h1, párrafo, botones) pasa a usar colores claros (`text-white`, `text-white/85`) ya que ahora está sobre un fondo oscuro/video en vez de blanco.
- `HeroMockup` (las tarjetas flotantes de ofertas) se mantiene igual — las `Card` ya tienen fondo blanco propio (`shadow-xl`), así que siguen siendo legibles sobre el video.
- Sin cambios en accesibilidad más allá de `aria-hidden` en el video (es puramente decorativo, no lleva información).

## 2. Chatbot de FAQ

**Crea:** `src/lib/data/faq.ts`

```ts
export interface PreguntaFrecuente {
  categoria: string
  pregunta: string
  respuesta: string
}

export const FAQ: PreguntaFrecuente[] = [
  // ~12 preguntas cubriendo: qué es un PCD, cómo vincularse, KYC,
  // tablero de ofertas, tokens, membresía, Telegram, contacto.
  // Contenido exacto se redacta en el Task 2 del plan de implementación.
]

export const CONTACTO_SOPORTE = {
  telefono: '3113472345',
  correo: 'info@bitwave.com',
}
```

**Crea:** `src/components/faq-chatbot.tsx` (client component)

- Burbuja flotante fija (`fixed bottom-6 right-6 z-50`), ícono de chat (`lucide-react`, p.ej. `MessageCircleQuestion`), estilo consistente con el resto del sitio (verde primario, `rounded-full`, sombra).
- Al hacer clic, abre/cierra un panel (`fixed bottom-24 right-6`, tarjeta con `Card` existente) con:
  - Encabezado: "Preguntas frecuentes" + botón cerrar.
  - Lista de preguntas agrupadas por `categoria`, cada una es un acordeón simple (estado local `openIndex`, sin librería nueva — reutiliza el patrón `<button>` + `AnimatePresence` de framer-motion que ya usa el proyecto).
  - Al final, tarjeta fija "¿No encontraste tu respuesta?" con `tel:3113472345` y `mailto:info@bitwave.com` como links.
- Animación de entrada/salida del panel con framer-motion (`AnimatePresence` + `motion.div`), consistente con el resto del sitio.
- Responsive: en móvil el panel ocupa casi todo el ancho con márgenes, no full-screen (para no bloquear navegación).

**Modifica:** `src/app/layout.tsx` — agrega `<FaqChatbot />` una sola vez, junto al resto del shell global (fuera de `{children}`, para que persista entre navegaciones).

## Testing

- No hay lógica de negocio compleja que amerite tests unitarios nuevos (es contenido estático + interacción de UI).
- Verificación manual en el navegador (Browser pane): hero carga el video y el texto es legible, el widget de FAQ abre/cierra, el acordeón despliega respuestas, los links `tel:`/`mailto:` tienen el `href` correcto, sin errores de consola, responsive en mobile.
- `npx tsc --noEmit` para confirmar tipos correctos del nuevo `PreguntaFrecuente[]`.

## Fuera de alcance

- Sin backend, sin IA/NLP, sin persistencia de qué preguntas se hicieron.
- Sin analítica de uso del chatbot (se puede agregar después si Jaime lo pide).
- El video no se comprime/optimiza en este cambio — si en producción pesa mucho, se puede revisar después (fuera de esta iteración).
