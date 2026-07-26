import { createClient } from '@/lib/supabase/server'

export interface TratoPorCalificar {
  ofertaId: string
  contraparte: string
  resumen: string
}

/**
 * Ofertas completadas donde `usuarioId` participó (como dueño o como quien
 * respondió) y que todavía no calificó. RLS ya deja ver una oferta
 * 'completada' tanto al dueño como a quien tuvo una intención sobre ella
 * (public.tiene_intencion_propia_en), así que esto funciona con el cliente
 * normal del usuario — no hace falta el cliente de servicio.
 */
export async function tratosPorCalificar(usuarioId: string): Promise<TratoPorCalificar[]> {
  const supabase = await createClient()

  const { data: ofertas } = await supabase
    .from('ofertas')
    .select('id, empresa, operacion, moneda, cantidad, precio_cop, usuario_id, interlocutor_id')
    .eq('estado', 'completada')
    .not('interlocutor_id', 'is', null)
    .or(`usuario_id.eq.${usuarioId},interlocutor_id.eq.${usuarioId}`)

  if (!ofertas?.length) return []

  const { data: yaCalificadas } = await supabase
    .from('calificaciones')
    .select('oferta_id')
    .eq('calificador_id', usuarioId)
    .in('oferta_id', ofertas.map((o) => o.id))

  const idsYaCalificados = new Set((yaCalificadas ?? []).map((c) => c.oferta_id))
  const pendientes = ofertas.filter((o) => !idsYaCalificados.has(o.id))
  if (!pendientes.length) return []

  const idsContrapartes = pendientes.map((o) => (o.usuario_id === usuarioId ? o.interlocutor_id! : o.usuario_id))
  const { data: contrapartes } = await supabase
    .from('perfiles_publicos')
    .select('id, razon_social')
    .in('id', idsContrapartes)
  const nombrePorId = new Map((contrapartes ?? []).map((c) => [c.id, c.razon_social]))

  return pendientes.map((o) => {
    const contraparteId = o.usuario_id === usuarioId ? o.interlocutor_id! : o.usuario_id
    return {
      ofertaId: o.id,
      contraparte: nombrePorId.get(contraparteId) ?? 'Contraparte',
      resumen: `${o.operacion === 'venta' ? 'Vende' : 'Compra'} ${o.moneda} ${o.cantidad.toLocaleString('es-CO')} a $${o.precio_cop.toLocaleString('es-CO')} COP`,
    }
  })
}
