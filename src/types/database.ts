// Tipos generados manualmente desde el esquema Supabase.
// En producción, generar con: npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type EstadoPerfil = 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido'
export type RolPerfil    = 'usuario' | 'admin'
export type TipoDoc      = 'rut' | 'camara_comercio' | 'resolucion_dian'
export type EstadoDoc    = 'pendiente' | 'aprobado' | 'rechazado'
export type TipoMembresia = 'plus' | 'premium'
export type EstadoMembresia = 'activa' | 'vencida' | 'cancelada'
export type Moneda       = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'MXN' | 'CHF' | 'AUD' | 'JPY'
export type Operacion    = 'compra' | 'venta'
export type Condicion    = 'efectivo' | 'transferencia' | 'para_recoger' | 'en_oficina'
export type EstadoOferta = 'activa' | 'expirada' | 'eliminada'
export type TipoIntencion = 'aceptar_precio' | 'solicitar_contacto'
export type EstadoIntencion = 'enviada' | 'vista' | 'cerrada'

export interface Database {
  public: {
    Tables: {
      perfiles_usuarios: {
        Row: {
          id:               string
          tipo_usuario:     'PCD'
          razon_social:     string
          nombre_comercial: string | null
          nit:              string | null
          sede:             string | null
          ciudad:           string | null
          telefono:         string | null
          whatsapp:         string | null
          correo:           string
          rol:              RolPerfil
          estado:           EstadoPerfil
          motivo_estado:    string | null
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['perfiles_usuarios']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['perfiles_usuarios']['Insert']>
      }
      documentos_kyc: {
        Row: {
          id:             string
          usuario_id:     string
          tipo_documento: TipoDoc
          storage_path:   string
          nombre_archivo: string | null
          estado:         EstadoDoc
          notas_revision: string | null
          revisado_por:   string | null
          revisado_at:    string | null
          created_at:     string
          updated_at:     string
        }
        Insert: Omit<Database['public']['Tables']['documentos_kyc']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['documentos_kyc']['Insert']>
      }
      membresias: {
        Row: {
          id:           string
          usuario_id:   string
          tipo:         TipoMembresia
          estado:       EstadoMembresia
          fecha_inicio: string
          fecha_fin:    string | null
          created_at:   string
          updated_at:   string
        }
        Insert: Omit<Database['public']['Tables']['membresias']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['membresias']['Insert']>
      }
      ofertas: {
        Row: {
          id:           string
          usuario_id:   string
          empresa:      string
          sede:         string | null
          operacion:    Operacion | null
          moneda:       Moneda
          cantidad:     number
          precio_cop:   number
          condiciones:  Condicion[]
          estado:       EstadoOferta
          fecha_oferta: string
          created_at:   string
          updated_at:   string
        }
        Insert: Omit<Database['public']['Tables']['ofertas']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Pick<Database['public']['Tables']['ofertas']['Row'], 'cantidad' | 'precio_cop' | 'estado'>>
      }
      intenciones: {
        Row: {
          id:              string
          oferta_id:       string
          usuario_id:      string
          tipo:            TipoIntencion
          comentarios:     string | null
          estado:          EstadoIntencion
          fecha_intencion: string
          created_at:      string
          updated_at:      string
        }
        Insert: Omit<Database['public']['Tables']['intenciones']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Pick<Database['public']['Tables']['intenciones']['Row'], 'estado'>>
      }
    }
    Views: {
      perfiles_publicos: {
        Row: {
          id:               string
          razon_social:     string
          nombre_comercial: string | null
          sede:             string | null
          ciudad:           string | null
          telefono:         string | null
          whatsapp:         string | null
          correo:           string
        }
      }
    }
    Functions: {
      es_admin:      { Args: { uid?: string }; Returns: boolean }
      es_aprobado:   { Args: { uid?: string }; Returns: boolean }
      limite_diario: { Args: { uid: string  }; Returns: number  }
      fecha_colombia:{ Args: Record<never,never>; Returns: string }
    }
  }
}
