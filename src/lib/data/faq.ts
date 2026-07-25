export interface PreguntaFrecuente {
  categoria: string
  pregunta: string
  respuesta: string
}

export const FAQ: PreguntaFrecuente[] = [
  {
    categoria: 'Sobre Tasa Directa',
    pregunta: '¿Qué es Tasa Directa?',
    respuesta:
      'Es un marketplace B2B exclusivo para Profesionales de Compra y Venta de Divisas (PCD) en Colombia. Conectamos la oferta y la demanda entre empresas verificadas; las operaciones se cierran directamente entre las partes, Tasa Directa no intermedia ni ejecuta transacciones cambiarias.',
  },
  {
    categoria: 'Sobre Tasa Directa',
    pregunta: '¿Qué es un PCD?',
    respuesta:
      'Un Profesional de Compra y Venta de Divisas, autorizado por la DIAN para operar cambio de divisas en Colombia. Todas las empresas en la plataforma deben acreditar esta condición.',
  },
  {
    categoria: 'Vinculación',
    pregunta: '¿Cómo vinculo mi empresa a la plataforma?',
    respuesta:
      'Cree una cuenta desde "Vincular mi empresa", complete los datos de su empresa y cargue los documentos requeridos (RUT, Cámara de Comercio, Resolución DIAN). Nuestro equipo de cumplimiento revisa y aprueba cada vinculación antes de habilitar el acceso al mercado.',
  },
  {
    categoria: 'Vinculación',
    pregunta: '¿Qué documentos necesito para vincularme?',
    respuesta:
      'RUT, Cámara de Comercio y Resolución DIAN como PCD. Dependiendo de su tipo de sociedad, puede requerirse también la composición accionaria. También debe completar una verificación de identidad del representante legal.',
  },
  {
    categoria: 'Vinculación',
    pregunta: '¿Cuánto tarda la aprobación de mi empresa?',
    respuesta:
      'Depende de la revisión del equipo de cumplimiento y de que los documentos estén completos y legibles. Puede consultar el estado de su solicitud en cualquier momento desde su panel.',
  },
  {
    categoria: 'Tablero de ofertas',
    pregunta: '¿Cómo funciona el tablero de ofertas?',
    respuesta:
      'Publique una necesidad de compra o venta de divisas (moneda, cantidad, precio y condiciones) y otros PCD podrán responder con su intención. Usted decide con quién cerrar la negociación; el contacto y el cierre son directos entre las empresas.',
  },
  {
    categoria: 'Tablero de ofertas',
    pregunta: '¿Por qué solo veo ofertas de mi zona?',
    respuesta:
      'Por defecto el tablero prioriza su área metropolitana para mostrarle contrapartes más cercanas, pero puede cambiar el filtro de zona en la parte superior del tablero para ver ofertas de otras ciudades o de todo el país.',
  },
  {
    categoria: 'Membresía y tokens',
    pregunta: '¿Qué es la membresía y qué incluye?',
    respuesta:
      'Es la suscripción que le da acceso al mercado (ver y participar en el tablero de ofertas). Sin una membresía activa puede completar su vinculación, pero no podrá publicar ni responder ofertas.',
  },
  {
    categoria: 'Membresía y tokens',
    pregunta: '¿Para qué sirven los tokens?',
    respuesta:
      'Los tokens se usan para acciones adicionales dentro del mercado, como destacar una oferta, publicar ofertas adicionales o activar alertas premium. Puede consultar su saldo de tokens en su panel.',
  },
  {
    categoria: 'Telegram',
    pregunta: '¿Para qué necesito vincular Telegram?',
    respuesta:
      'Por seguridad, las alertas de Tasa Directa (nuevas ofertas, respuestas, negociaciones) se envían por la app de Telegram. Es indispensable tener Telegram instalado en su celular para recibir estas notificaciones en tiempo real.',
  },
  {
    categoria: 'Telegram',
    pregunta: 'El QR de Telegram no funciona, ¿qué hago?',
    respuesta:
      'Lo más común es que el celular no tenga la app de Telegram instalada. Descárguela desde la Play Store (Android) o App Store (iOS) y luego escanee el QR nuevamente desde la sección "Avisos por Telegram" de su panel.',
  },
]

export const CONTACTO_SOPORTE = {
  telefono: '3113472345',
  correo: 'info@bitwave.com',
}
