'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircleQuestion, X, ChevronDown, Phone, Mail } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { FAQ, CONTACTO_SOPORTE } from '@/lib/data/faq'
import { cn } from '@/lib/utils'

const CATEGORIAS = Array.from(new Set(FAQ.map((p) => p.categoria)))

export function FaqChatbot() {
  const [abierto, setAbierto] = useState(false)
  const [preguntaAbierta, setPreguntaAbierta] = useState<string | null>(null)
  const [mostrarAviso, setMostrarAviso] = useState(false)

  useEffect(() => {
    const aparecer = setTimeout(() => setMostrarAviso(true), 2500)
    return () => clearTimeout(aparecer)
  }, [])

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
        <AnimatePresence>
          {mostrarAviso && !abierto && (
            <motion.div
              initial={{ opacity: 0, x: 12, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1, y: [0, -4, 0] }}
              exit={{ opacity: 0, x: 12, scale: 0.9 }}
              transition={{
                opacity: { duration: 0.3 },
                x: { duration: 0.3 },
                scale: { duration: 0.3 },
                y: { duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 },
              }}
              className="relative flex items-center gap-2 rounded-full bg-white py-2 pl-4 pr-2 text-sm font-medium text-foreground shadow-lg ring-1 ring-border"
            >
              ¿Necesitas ayuda?
              <button
                type="button"
                onClick={() => setMostrarAviso(false)}
                aria-label="Cerrar aviso"
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => {
            setAbierto((v) => !v)
            setMostrarAviso(false)
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={abierto ? 'Cerrar preguntas frecuentes' : 'Abrir preguntas frecuentes'}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl"
        >
          {abierto ? <X className="size-6" /> : <MessageCircleQuestion className="size-6" />}
        </motion.button>
      </div>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-4 left-4 z-50 sm:left-auto sm:right-6 sm:w-96"
          >
            <Card className="max-h-[70vh] overflow-hidden py-0 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border bg-accent px-4 py-3">
                <p className="font-semibold text-accent-foreground">Preguntas frecuentes</p>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="text-accent-foreground/70 hover:text-accent-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              <CardContent className="max-h-[calc(70vh-3.25rem)] overflow-y-auto px-0 py-2">
                {CATEGORIAS.map((categoria) => (
                  <div key={categoria} className="px-4 py-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {categoria}
                    </p>
                    <div className="flex flex-col gap-1">
                      {FAQ.filter((p) => p.categoria === categoria).map((p) => {
                        const abierta = preguntaAbierta === p.pregunta
                        return (
                          <div key={p.pregunta} className="rounded-md border border-border">
                            <button
                              type="button"
                              onClick={() => setPreguntaAbierta(abierta ? null : p.pregunta)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
                            >
                              {p.pregunta}
                              <ChevronDown
                                className={cn('size-4 shrink-0 transition-transform', abierta && 'rotate-180')}
                              />
                            </button>
                            <AnimatePresence initial={false}>
                              {abierta && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <p className="px-3 pb-3 text-sm text-muted-foreground">{p.respuesta}</p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                <div className="mx-4 mt-2 flex flex-col gap-2 rounded-md bg-accent/50 p-3 text-sm">
                  <p className="font-medium text-accent-foreground">¿No encontró su respuesta?</p>
                  <a href={`tel:${CONTACTO_SOPORTE.telefono}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Phone className="size-4" /> {CONTACTO_SOPORTE.telefono}
                  </a>
                  <a href={`mailto:${CONTACTO_SOPORTE.correo}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Mail className="size-4" /> {CONTACTO_SOPORTE.correo}
                  </a>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
