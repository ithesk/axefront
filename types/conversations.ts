export interface MensajePB {
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
  
export interface ConversacionPB {
    telefono: string;
    nombre: string;
    mensajes: MensajePB[];
    ultimoMensaje?: string;
    timestamp?: string;
}
