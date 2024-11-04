import { useState, useEffect, useRef } from 'react';
import { Play, FileText, Pause, Download } from 'lucide-react';
import { Button } from './ui/button';
import { getFileUrl, verificarArchivo } from '../lib/pocketbase';

interface MediaViewerProps {
  collectionId: string;
  recordId: string;
  fileName: string;
  tipo: 'audio' | 'imagen' | 'documento';
  message?: string; // Nuevo prop para recibir el mensaje con la transcripción
  onError?: (error: string) => void;
}

const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Función auxiliar para extraer la transcripción del mensaje
const extractTranscription = (message?: string) => {
  console.log('Extrayendo transcripción:', message);
  if (!message) return null;
  const match = message.match(/Nota de voz - Transcripción: (.+)/);
  console.log('Coincidencia encontrada:', match);
  return match ? match[1] : null;
};

export function MediaViewer({ collectionId, recordId, fileName, tipo, message, onError }: MediaViewerProps) {
  const [url, setUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivoExiste, setArchivoExiste] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const startTimeRef = useRef<number>(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isMobile = isMobileDevice();

  useEffect(() => {
    async function inicializarMedia() {
      try {
        console.log('Inicializando MediaViewer:', { collectionId, recordId, fileName, tipo });
        
        const mediaUrl = getFileUrl(collectionId, recordId, fileName);
        if (!mediaUrl) {
          throw new Error('No se pudo generar la URL del archivo');
        }

        const existe = await verificarArchivo(mediaUrl);
        if (!existe) {
          throw new Error('El archivo no existe en el servidor');
        }

        setArchivoExiste(true);
        setUrl(mediaUrl);
        console.log('Media inicializado correctamente:', { mediaUrl, tipo });

        if (tipo === 'audio') {
          try {
            setIsLoading(true);
            const response = await fetch(mediaUrl);
            
            if (!response.ok) throw new Error('No se pudo descargar el audio');

            const arrayBuffer = await response.arrayBuffer();
            console.log('Audio descargado:', {
              tipo: response.headers.get('content-type'),
              tamaño: arrayBuffer.byteLength
            });

            // Inicializar AudioContext solo cuando sea necesario
            if (!audioContextRef.current) {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              audioContextRef.current = new AudioContextClass();
              gainNodeRef.current = audioContextRef.current.createGain();
              gainNodeRef.current.connect(audioContextRef.current.destination);
            }

            const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            setAudioBuffer(decodedBuffer);
            setDuration(decodedBuffer.duration);
            setIsLoading(false);
            setPlaybackFailed(false);
            
            console.log('Audio decodificado:', {
              duración: decodedBuffer.duration,
              canales: decodedBuffer.numberOfChannels,
              sampleRate: decodedBuffer.sampleRate
            });
          } catch (err) {
            console.error('Error al procesar audio:', err);
            setIsLoading(false);
            if (isMobile) {
              setPlaybackFailed(true);
            } else {
              throw new Error('Error al procesar el audio');
            }
          }
        }
      } catch (error: unknown) {
        console.error('Error al inicializar media:', error);
        const mensaje = `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`;
        setError(mensaje);
        onError?.(mensaje);
      }
    }

    inicializarMedia();

    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [collectionId, recordId, fileName, tipo, onError, isMobile]);

  useEffect(() => {
    let animationFrame: number;
    
    const updateProgress = () => {
      if (isPlaying && startTimeRef.current && audioContextRef.current && audioBuffer) {
        const currentTime = audioContextRef.current.currentTime - startTimeRef.current;
        const progress = (currentTime / audioBuffer.duration) * 100;
        
        setCurrentTime(currentTime);
        setProgress(Math.min(progress, 100));

        if (currentTime >= audioBuffer.duration) {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        } else {
          animationFrame = requestAnimationFrame(updateProgress);
        }
      }
    };

    if (isPlaying) {
      animationFrame = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isPlaying, audioBuffer]);

  const handlePlayPause = async () => {
    if (!audioBuffer || !audioContextRef.current || isLoading) return;

    try {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (isPlaying) {
        if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        }
        setIsPlaying(false);
      } else {
        const sourceNode = audioContextRef.current.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(gainNodeRef.current!);
        
        sourceNode.onended = () => {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        };

        startTimeRef.current = audioContextRef.current.currentTime;
        sourceNode.start();
        sourceNodeRef.current = sourceNode;
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Error al reproducir audio:', err);
      if (isMobile) {
        setPlaybackFailed(true);
      } else {
        setError('Error al reproducir el audio');
      }
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioBuffer || !audioContextRef.current || !progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    const newTime = (percentage / 100) * audioBuffer.duration;

    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
    }

    const sourceNode = audioContextRef.current.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(gainNodeRef.current!);
    
    startTimeRef.current = audioContextRef.current.currentTime - newTime;
    sourceNode.start(0, newTime);
    sourceNodeRef.current = sourceNode;
    setIsPlaying(true);
  };

  const handleDownload = async () => {
    if (!url) return;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se pudo descargar el archivo');

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Error al descargar:', err);
      setError('Error al descargar el archivo');
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (error || !url || !archivoExiste) {
    return (
      <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
        {error || 'Error al cargar el contenido multimedia'}
      </div>
    );
  }

  if (tipo === 'audio') {
    const transcription = extractTranscription(message);

    if (isMobile && playbackFailed) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="flex-1 text-sm text-muted-foreground">
              La reproducción no está disponible. Por favor, descarga el audio para escucharlo.
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full hover:bg-primary/10 transition-all duration-300"
              onClick={handleDownload}
              title="Descargar audio"
            >
              <Download className="w-4 h-4 text-primary" />
            </Button>
          </div>
          {transcription && (
            <div className="p-4 rounded-lg bg-muted/30 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary/70" />
                <p className="font-medium text-primary/70">Transcripción</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {transcription}
              </p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 shadow-lg hover:shadow-xl transition-all duration-300">
          <Button
            size="icon"
            variant="ghost"
            className="h-12 w-12 rounded-full bg-primary/10 hover:bg-primary/20 transition-all duration-300"
            onClick={handlePlayPause}
            disabled={isLoading || !audioBuffer}
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
            ) : isPlaying ? (
              <Pause className="w-5 h-5 text-primary" />
            ) : (
              <Play className="w-5 h-5 text-primary ml-0.5" />
            )}
          </Button>
          
          <div className="flex-1 space-y-2">
            <div 
              ref={progressBarRef}
              className="h-2 bg-primary/10 rounded-full cursor-pointer hover:bg-primary/15 transition-colors duration-200"
              onClick={handleProgressClick}
            >
              <div 
                className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <div className="flex justify-between text-sm text-muted-foreground font-medium">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full hover:bg-primary/10 transition-all duration-300"
            onClick={handleDownload}
            title="Descargar audio"
          >
            <Download className="w-4 h-4 text-primary" />
          </Button>
        </div>
        
        {transcription && (
          <div className="p-4 rounded-lg bg-muted/30 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary/70" />
              <p className="font-medium text-primary/70">Transcripción</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {transcription}
            </p>
          </div>
        )}
      </div>
    );
  }
  

  if (tipo === 'imagen') {
    return (
      <div className="rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
        <img
          src={url}
          alt="Contenido multimedia"
          className="w-full h-auto"
          onError={(e) => {
            console.error('Error al cargar imagen:', e);
            const mensaje = 'Error al cargar la imagen';
            setError(mensaje);
            onError?.(mensaje);
          }}
        />
      </div>
    );
  }

  if (tipo === 'documento') {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <a 
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200"
          onClick={async (e) => {
            const existe = await verificarArchivo(url);
            if (!existe) {
              e.preventDefault();
              const mensaje = 'El documento ya no está disponible';
              setError(mensaje);
              onError?.(mensaje);
            }
          }}
        >
          Ver documento
        </a>
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 rounded-full hover:bg-primary/10 transition-all duration-300"
          onClick={handleDownload}
          title="Descargar documento"
        >
          <Download className="w-4 h-4 text-primary" />
        </Button>
      </div>
    );
  }

  return null;
}
