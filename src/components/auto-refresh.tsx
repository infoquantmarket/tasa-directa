'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Vuelve a pedir los datos del Server Component cada `intervalMs` sin
 * recargar la página, para que el tablero/listas del mercado no se queden
 * congeladas mientras otros PCD publican, responden o aceptan ofertas.
 */
export function AutoRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
