// Tipos generados manualmente desde el esquema Supabase.
// En producción, generar con: npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type EstadoPerfil = 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido'
export type RolPerfil    = 'usuario' | 'admin'
export type TipoDoc      = 'rut' | 'camara_comercio' | 'resolucion_dian' | 'composicion_accionaria'
export type EstadoDoc    = 'pendiente' | 'aprobado' | 'rechazado'
export type TipoMembresia = 'estandar'
export type EstadoMembresia = 'activa' | 'vencida' | 'cancelada'
export type TokenConcepto = 'compra' | 'ajuste_admin' | 'destacar_oferta' | 'alerta_premium' | 'oferta_urgente' | 'republicacion' | 'reembolso' | 'oferta_adicional'
export type Moneda       =
  | 'USD' | 'EUR' | 'MXN' | 'CAD'
  | 'CRC' | 'NOK' | 'SEK' | 'AUD' | 'NZD' | 'AWG' | 'ANG' | 'CHF' | 'GBP' | 'TRY' | 'PEN'
  | 'ARS' | 'BOB' | 'CLP' | 'DOP' | 'UYU' | 'GTQ' | 'BRL' | 'INR' | 'JPY' | 'CNY'
export type Operacion    = 'compra' | 'venta'
export type Condicion    = 'efectivo' | 'transferencia' | 'para_recoger' | 'en_oficina'
export type EstadoOferta = 'activa' | 'en_negociacion' | 'completada' | 'expirada' | 'eliminada'
export type TipoIntencion = 'aceptar_precio' | 'solicitar_contacto'
export type EstadoIntencion = 'enviada' | 'vista' | 'cerrada'
export type TipoAceptacion =
  | 'contrato_servicios'
  | 'tratamiento_datos'
  | 'politica_tratamiento'
  | 'terminos_condiciones'
  | 'aviso_privacidad'
  | 'politica_kyc'
  | 'politica_reembolsos'

export type EstadoVerificacionIdentidad =
  | 'Not Started' | 'In Progress' | 'Approved' | 'Declined' | 'In Review'
  | 'Abandoned' | 'Expired' | 'Kyc Expired' | 'Resubmitted' | 'Awaiting User'

export interface Database {
  public: {
    Tables: {
      perfiles_usuarios: {
        Row: {
          id:               string
          tipo_usuario:     'PCD'
          razon_social:     string | null
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
          tipo_sociedad:    string | null
          direccion:        string | null
          sitio_web:        string | null
          rep_nombre:       string | null
          rep_tipo_doc:     string | null
          rep_num_doc:      string | null
          rep_correo:       string | null
          rep_celular:      string | null
          contacto_nombre:  string | null
          contacto_cargo:   string | null
          contacto_celular: string | null
          contacto_correo:  string | null
          perfil_completo:  boolean
          created_at:       string
          updated_at:       string
        }
        Insert: Omit<Database['public']['Tables']['perfiles_usuarios']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['perfiles_usuarios']['Insert']>
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      ofertas: {
        Row: {
          id:         string
          usuario_id: string
          empresa:    string
          sede:       string | null
          operacion:  Operacion | null
          moneda:     Moneda
          cantidad:   number
          precio_cop: number
          condiciones: Condicion[]
          estado:     EstadoOferta
          notas:      string | null
          expira_en:  string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['ofertas']['Row'], 'id' | 'expira_en' | 'created_at' | 'updated_at'> & { expira_en?: string }
        Update: Partial<Pick<Database['public']['Tables']['ofertas']['Row'], 'cantidad' | 'precio_cop' | 'estado'>>
        Relationships: []
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
        Insert: Omit<Database['public']['Tables']['intenciones']['Row'], 'id' | 'fecha_intencion' | 'created_at' | 'updated_at'> & { fecha_intencion?: string }
        Update: Partial<Pick<Database['public']['Tables']['intenciones']['Row'], 'estado'>>
        Relationships: []
      }
      token_saldos: {
        Row: {
          usuario_id: string
          saldo:      number
          updated_at: string
        }
        Insert: never   // solo escriben las funciones definer
        Update: never
        Relationships: []
      }
      token_movimientos: {
        Row: {
          id:         string
          usuario_id: string
          delta:      number
          concepto:   TokenConcepto
          referencia: string | null
          nota:       string | null
          creado_por: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      aceptaciones: {
        Row: {
          id:           string
          usuario_id:   string
          documento:    TipoAceptacion
          version:      string
          ip:           string | null
          user_agent:   string | null
          razon_social: string | null
          nit:          string | null
          rep_nombre:   string | null
          rep_num_doc:  string | null
          created_at:   string
        }
        Insert: Omit<Database['public']['Tables']['aceptaciones']['Row'], 'id' | 'created_at'>
        Update: never
        Relationships: []
      }
      validaciones_identidad: {
        Row: {
          id:         string
          usuario_id: string
          proveedor:  string
          session_id: string
          estado:     EstadoVerificacionIdentidad
          decision:   Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          usuario_id: string
          proveedor?: string
          session_id: string
          estado?: EstadoVerificacionIdentidad
        }
        // updated_at NO se incluye: lo maneja el trigger set_updated_at()
        // (migration 0006), igual que en el resto de tablas mutables.
        Update: {
          estado?: EstadoVerificacionIdentidad
          decision?: Json | null
        }
        Relationships: []
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
          contacto_nombre:  string
          contacto_celular: string
          contacto_correo:  string
        }
        Relationships: []
      }
    }
    Functions: {
      es_admin:      { Args: { uid?: string }; Returns: boolean }
      es_aprobado:   { Args: { uid?: string }; Returns: boolean }
      fecha_colombia:{ Args: Record<never,never>; Returns: string }
      tiene_membresia_activa: { Args: { uid?: string }; Returns: boolean }
      otorgar_tokens: {
        Args: { p_usuario: string; p_cantidad: number; p_nota?: string; p_concepto?: string; p_referencia?: string }
        Returns: number
      }
      consumir_tokens: {
        Args: { p_cantidad: number; p_concepto: string; p_referencia?: string; p_nota?: string }
        Returns: number
      }
      completar_oferta: { Args: { p_oferta_id: string }; Returns: void }
      cerrar_negociacion_sin_acuerdo: { Args: { p_oferta_id: string }; Returns: void }
    }
  }
}
