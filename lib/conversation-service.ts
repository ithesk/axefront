import { pb } from './pocketbase';
import { ClientResponseError } from 'pocketbase';
import { verificarArchivo } from './pocketbase';

// Definir los tipos aquí ya que hay un problema con la importación
interface MensajePB {
  id: string;
  collectionId: string;
  collectionName?: string;
  phone: string;
  name: string;
  message: string;
  media?: string;
  timestamp: string;
  tipo?: 'texto' | 'voz' | 'imagen' | 'documento';
}

interface ConversacionPB {
  telefono: string;
  nombre: string;
  mensajes: MensajePB[];
  ultimoMensaje?: string;
  timestamp: string; // Cambiado a requerido para evitar el error de TypeScript
}

export async function obtenerConversaciones(busqueda: string = '') {
  try {
    console.log('Intentando obtener conversaciones...');
    
    const filtro = busqueda ? 
      `name ~ "${busqueda}" || phone ~ "${busqueda}" || message ~ "${busqueda}"` 
      : '';

    const records = await pb.collection('conversations').getFullList({
      sort: '-timestamp',
      filter: filtro,
      fields: 'id,collectionId,phone,name,message,media,timestamp',
      requestKey: 'conversations-list',
      $cancelKey: 'conversations-list',
    });

    console.log('Registros obtenidos:', records.length);

    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    const conversaciones = records.reduce((acc: { [key: string]: ConversacionPB }, mensaje: any) => {
      const mensajeProcesado: MensajePB = {
        ...mensaje,
        tipo: detectarTipoMensaje(mensaje.message)
      };

      if (!acc[mensaje.phone]) {
        acc[mensaje.phone] = {
          telefono: mensaje.phone,
          nombre: mensaje.name,
          mensajes: [],
          ultimoMensaje: mensaje.message,
          timestamp: mensaje.timestamp || new Date().toISOString() // Valor por defecto
        };
      }

      acc[mensaje.phone].mensajes.push(mensajeProcesado);

      const mensajeTimestamp = mensaje.timestamp || new Date().toISOString();
      if (new Date(mensajeTimestamp) > new Date(acc[mensaje.phone].timestamp)) {
        acc[mensaje.phone].timestamp = mensajeTimestamp;
        acc[mensaje.phone].ultimoMensaje = mensaje.message;
      }

      return acc;
    }, {});

    console.log('Conversaciones procesadas:', Object.keys(conversaciones).length);
    return Object.values(conversaciones);
  } catch (error: unknown) {
    if (error instanceof ClientResponseError && error.message.includes('autocancelled')) {
      console.log('Solicitud cancelada automáticamente, intentando recuperar datos en caché...');
      return [];
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error detallado al obtener conversaciones:', error);
    throw new Error(`Error al obtener conversaciones: ${errorMessage}`);
  }
}

export async function obtenerMensajesConversacion(telefono: string) {
  try {
    console.log('Obteniendo mensajes para:', telefono);
    
    const records = await pb.collection('conversations').getFullList({
      sort: 'timestamp',
      filter: `phone = "${telefono}"`,
      fields: 'id,collectionId,phone,name,message,media,timestamp',
      requestKey: `conversation-${telefono}`,
      $cancelKey: `conversation-${telefono}`,
    });

    console.log('Mensajes encontrados:', records.length);

    const mensajesProcesados = await Promise.all(records.map(async (mensaje: any) => {
      const mensajeProcesado: MensajePB = {
        ...mensaje,
        tipo: detectarTipoMensaje(mensaje.message)
      };

      if (mensaje.media) {
        const url = pb.files.getUrl(
          { collectionId: mensaje.collectionId, id: mensaje.id },
          mensaje.media
        );
        const existe = await verificarArchivo(url);
        if (!existe) {
          console.warn('Archivo multimedia no encontrado:', {
            id: mensaje.id,
            media: mensaje.media
          });
        }
      }

      return mensajeProcesado;
    }));

    return mensajesProcesados;
  } catch (error: unknown) {
    if (error instanceof ClientResponseError && error.message.includes('autocancelled')) {
      console.log('Solicitud de mensajes cancelada automáticamente...');
      return [];
    }
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error detallado al obtener mensajes:', error);
    throw new Error(`Error al obtener mensajes: ${errorMessage}`);
  }
}

function detectarTipoMensaje(mensaje: string): 'texto' | 'voz' | 'imagen' | 'documento' {
  if (!mensaje) return 'texto';
  
  const mensajeLower = mensaje.toLowerCase();
  if (mensajeLower.includes('voice') || mensajeLower.includes('nota de voz')) return 'voz';
  if (mensajeLower.includes('image') || mensajeLower.includes('archivo multimedia')) return 'imagen';
  if (mensajeLower.includes('document') || mensajeLower.includes('documento')) return 'documento';
  return 'texto';
}
