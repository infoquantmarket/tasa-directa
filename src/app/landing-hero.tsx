'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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

const OFERTAS_MUESTRA = [
  { operacion: 'Vende', moneda: 'USD', empresa: 'Cambios del Valle S.A.S', cantidad: '10.000', precio: '4.180', condicion: 'Efectivo', vence: '18h 42min' },
  { operacion: 'Compra', moneda: 'EUR', empresa: 'Divisas Andina Ltda', cantidad: '5.000', precio: '4.550', condicion: 'Transferencia', vence: '6h 10min' },
  { operacion: 'Vende', moneda: 'MXN', empresa: 'PCD Norte S.A.S', cantidad: '50.000', precio: '235', condicion: 'En oficina', vence: '23h 58min' },
] as const

const EASE_PRO = [0.22, 1, 0.36, 1] as const

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE_PRO } },
}

function HeroMockup() {
  return (
    <div className="relative hidden h-[26rem] w-full items-center justify-center md:flex">
      {OFERTAS_MUESTRA.map((o, i) => {
        const offsets = [
          { x: 0, y: 0, rotate: -2, z: 30, delay: 0.5, float: 4 },
          { x: 48, y: 56, rotate: 4, z: 20, delay: 0.65, float: 5 },
          { x: -40, y: 108, rotate: -5, z: 10, delay: 0.8, float: 6 },
        ][i]
        return (
          <motion.div
            key={o.empresa}
            initial={{ opacity: 0, y: offsets.y + 30, scale: 0.95 }}
            animate={{
              opacity: i === 0 ? 1 : 0.85 - i * 0.1,
              y: [offsets.y, offsets.y - offsets.float, offsets.y],
              scale: 1,
            }}
            transition={{
              opacity: { duration: 0.8, delay: offsets.delay, ease: EASE_PRO },
              scale: { duration: 0.8, delay: offsets.delay, ease: EASE_PRO },
              y: { duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: offsets.delay + 0.8 },
            }}
            style={{ zIndex: offsets.z, x: offsets.x, rotate: offsets.rotate }}
            className="absolute w-72"
          >
            <Card className="shadow-xl ring-1 ring-border/60">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    {o.operacion} {o.moneda}
                  </CardTitle>
                  <CardDescription>{o.empresa}</CardDescription>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Vence en {o.vence}</span>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cantidad</span>
                  <span className="font-medium">{o.cantidad} {o.moneda}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio</span>
                  <span className="font-medium">${o.precio} COP</span>
                </div>
                <span className="w-fit rounded-full bg-accent/40 px-2 py-0.5 text-xs">{o.condicion}</span>
              </CardContent>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}

export function LandingHero() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <motion.div
            className="absolute left-[10%] top-0 h-[36rem] w-[36rem] rounded-full bg-primary/10 blur-3xl md:left-1/4"
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 8, ease: 'easeInOut', repeat: Infinity }}
          />
          <motion.div
            className="absolute right-[5%] top-16 h-80 w-80 rounded-full bg-accent blur-3xl"
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity, delay: 1 }}
          />
        </div>

        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-6 py-24 md:grid-cols-2 md:gap-4 md:py-28">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center text-center md:items-start md:text-left"
          >
            <motion.p
              variants={fadeInUp}
              className="mb-4 rounded-full border border-border bg-accent px-4 py-1 text-sm font-medium text-accent-foreground"
            >
              Seguridad y Confianza
            </motion.p>
            <motion.h1 variants={fadeInUp} className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
              El marketplace B2B del sector cambiario en Colombia
            </motion.h1>
            <motion.p variants={fadeInUp} className="mt-6 max-w-lg text-lg text-muted-foreground">
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

          <HeroMockup />
        </div>
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
