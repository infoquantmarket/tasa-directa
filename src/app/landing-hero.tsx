'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ShieldCheck, FileCheck2, Handshake } from 'lucide-react'

const PILARES = [
  {
    icono: ShieldCheck,
    titulo: 'Solo PCD verificados',
    texto: 'Cada Profesional de Compra y Venta de Divisas pasa por verificación documental: RUT, Cámara de Comercio y Resolución DIAN.',
  },
  {
    icono: FileCheck2,
    titulo: 'Cumplimiento primero',
    texto: 'Un equipo de cumplimiento revisa y aprueba cada vinculación antes de habilitar el acceso al mercado.',
  },
  {
    icono: Handshake,
    titulo: 'Conexión directa',
    texto: 'Tasa Directa conecta la oferta y la demanda entre profesionales. Las operaciones se cierran directamente entre las partes.',
  },
]

const EASE_PRO = [0.22, 1, 0.36, 1] as const

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE_PRO } },
}

export function LandingHero() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <motion.div
            className="absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 8, ease: 'easeInOut', repeat: Infinity }}
          />
          <motion.div
            className="absolute right-[10%] top-24 h-64 w-64 rounded-full bg-accent blur-3xl"
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity, delay: 1 }}
          />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-24 text-center"
        >
          <motion.p
            variants={fadeInUp}
            className="mb-4 rounded-full border border-border bg-accent px-4 py-1 text-sm font-medium text-accent-foreground"
          >
            Seguridad y Confianza
          </motion.p>
          <motion.h1 variants={fadeInUp} className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            El marketplace B2B del sector cambiario en Colombia
          </motion.h1>
          <motion.p variants={fadeInUp} className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Plataforma exclusiva para Profesionales de Compra y Venta de Divisas (PCD)
            autorizados por la DIAN. Publique sus necesidades, encuentre contraparte
            y negocie de forma directa.
          </motion.p>
          <motion.div variants={fadeInUp} className="mt-10 flex gap-4">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <Button
                size="lg"
                className="shadow-[0_0_0_0_rgba(8,128,96,0.35)] transition-shadow duration-300 hover:shadow-[0_0_0_6px_rgba(8,128,96,0.15)]"
                render={<Link href="/registro" />}
              >
                Vincular mi empresa
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <Button
                size="lg"
                variant="outline"
                className="transition-colors duration-300 hover:border-primary/50"
                render={<Link href="/login" />}
              >
                Ya tengo cuenta
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      <section className="border-t border-border bg-white">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={staggerContainer}
          className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-16 sm:grid-cols-3"
        >
          {PILARES.map(({ icono: Icono, titulo, texto }) => (
            <motion.div
              key={titulo}
              variants={fadeInUp}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex flex-col gap-3 rounded-lg p-2 transition-shadow duration-300 hover:shadow-lg"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                <Icono className="h-5 w-5 text-primary" />
              </span>
              <h2 className="font-semibold">{titulo}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{texto}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </>
  )
}
