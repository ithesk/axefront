import PocketBase from 'pocketbase';

// Usar variable de entorno o fallback a localhost
const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

// Inicializar PocketBase
export const pb = new PocketBase(POCKETBASE_URL);

// Función mejorada para obtener la URL del archivo
export function getFileUrl(collectionId: string, recordId: string, fileName: string) {
  try {
    if (!collectionId || !recordId || !fileName) {
      console.error('Parámetros inválidos para getFileUrl:', { collectionId, recordId, fileName });
      return '';
    }

    // Construir la URL usando el método oficial de PocketBase
    const record = {
      collectionId,
      id: recordId,
      fileName
    };

    const url = pb.files.getUrl(record, fileName);

    console.log('URL generada para archivo:', { url, collectionId, recordId, fileName });
    return url;
  } catch (error) {
    console.error('Error al construir la URL del archivo:', error);
    return '';
  }
}

// Función para verificar si un archivo existe
export async function verificarArchivo(url: string): Promise<boolean> {
  try {
    console.log('Verificando existencia de archivo:', url);
    const response = await fetch(url, { method: 'HEAD' });
    const existe = response.ok;
    console.log('Resultado de verificación:', { url, existe });
    return existe;
  } catch (error) {
    console.error('Error al verificar archivo:', error);
    return false;
  }
}
