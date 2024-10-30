'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { 
  Search, 
  Phone, 
  ArrowLeft, 
  MessageSquare,
  Loader2,
  Image as ImageIcon,
  FileText,
  Mic
} from 'lucide-react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { obtenerConversaciones, obtenerMensajesConversacion } from '@/lib/conversation-service'
import type { ConversacionPB, MensajePB } from '@/types/conversations'
import { MediaViewer } from './media-viewer'

// Helper para formatear fechas
const formatearFecha = (fecha: string) => {
  if (!fecha) return ''
  
  const ahora = new Date()
  const fechaMensaje = new Date(fecha)
  const diferencia = ahora.getTime() - fechaMensaje.getTime()
  const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24))

  if (dias === 0) {
    return fechaMensaje.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (dias === 1) {
    return 'Ayer'
  } else if (dias < 7) {
    return fechaMensaje.toLocaleDateString([], { weekday: 'long' })
  } else {
    return fechaMensaje.toLocaleDateString()
  }
}

// Función para obtener el último mensaje
const obtenerUltimoMensaje = (mensajes?: MensajePB[]) => {
  if (!mensajes || mensajes.length === 0) {
    return null;
  }

  // Ordenamos los mensajes por fecha, del más reciente al más antiguo
  const mensajesOrdenados = [...mensajes].sort((a, b) => {
    const fechaA = new Date(a.timestamp || 0).getTime();
    const fechaB = new Date(b.timestamp || 0).getTime();
    return fechaB - fechaA;
  });

  return mensajesOrdenados[0];
};

// Componente para mostrar la vista previa del último mensaje
const PreviewUltimoMensaje = ({ mensajes }: { mensajes?: MensajePB[] }) => {
  const ultimoMensaje = obtenerUltimoMensaje(mensajes);

  if (!ultimoMensaje?.message) {
    return null;
  }

  const mensajeLower = ultimoMensaje.message.toLowerCase();
  let icono = <MessageSquare className="w-4 h-4" />;
  let texto = ultimoMensaje.message;

  if (mensajeLower.includes('voice') || mensajeLower.includes('nota de voz')) {
    icono = <Mic className="w-4 h-4" />;
    texto = 'Nota de voz';
  } else if (mensajeLower.includes('image') || mensajeLower.includes('multimedia')) {
    icono = <ImageIcon className="w-4 h-4" />;
    texto = 'Imagen';
  } else if (mensajeLower.includes('document')) {
    icono = <FileText className="w-4 h-4" />;
    texto = 'Documento';
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {icono}
      <p className="truncate max-w-[300px]">{texto}</p>
      <span className="text-xs text-muted-foreground ml-auto shrink-0">
        {formatearFecha(ultimoMensaje.timestamp || '')}
      </span>
    </div>
  );
};

// Componente para mostrar contadores de tipos de mensajes
const ContadorTipoMensajes = ({ mensajes }: { mensajes?: MensajePB[] | null }) => {
  if (!mensajes || !mensajes.length) {
    return null;
  }

  const contadores = {
    voz: mensajes.filter(m => m.message?.toLowerCase().includes('voice')).length,
    imagenes: mensajes.filter(m => m.message?.toLowerCase().includes('image')).length,
    documentos: mensajes.filter(m => m.message?.toLowerCase().includes('document')).length
  }

  return (
    <div className="flex items-center gap-2">
      {contadores.voz > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className="h-6">
                <Mic className="w-3 h-3 mr-1" />
                {contadores.voz}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {contadores.voz} {contadores.voz === 1 ? 'nota de voz' : 'notas de voz'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {contadores.imagenes > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className="h-6">
                <ImageIcon className="w-3 h-3 mr-1" />
                {contadores.imagenes}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {contadores.imagenes} {contadores.imagenes === 1 ? 'imagen' : 'imágenes'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {contadores.documentos > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className="h-6">
                <FileText className="w-3 h-3 mr-1" />
                {contadores.documentos}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {contadores.documentos} {contadores.documentos === 1 ? 'documento' : 'documentos'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

export default function ChatViewer() {
  // Estados
  const [conversaciones, setConversaciones] = useState<ConversacionPB[]>([])
  const [conversacionesFiltradas, setConversacionesFiltradas] = useState<ConversacionPB[]>([])
  const [conversacionSeleccionada, setConversacionSeleccionada] = useState<ConversacionPB | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaMensajes, setBusquedaMensajes] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tabActual, setTabActual] = useState('todos')
  const timeoutRef = useRef<NodeJS.Timeout>()
  const viewportRef = useRef<HTMLDivElement>(null)

  // Función para cargar las conversaciones
  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true)
      setError(null)
      const datos = await obtenerConversaciones()
      // Asegurarnos de que cada conversación tenga su array de mensajes inicializado
      const conversacionesFormateadas = datos.map(conv => ({
        ...conv,
        mensajes: conv.mensajes || []
      }))
      setConversaciones(conversacionesFormateadas)
      setConversacionesFiltradas(conversacionesFormateadas)
    } catch (err) {
      console.error('Error en cargarDatos:', err)
      setError('Error al cargar las conversaciones')
    } finally {
      setCargando(false)
    }
  }, [])

  // Efecto para manejar la búsqueda con debounce
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      const busquedaLower = busqueda.toLowerCase().trim()
      const resultados = conversaciones.filter(conv => {
        const nombreCoincide = conv.nombre.toLowerCase().includes(busquedaLower)
        const telefonoCoincide = conv.telefono.toLowerCase().includes(busquedaLower)
        // Buscar también en el último mensaje
        const ultimoMensaje = obtenerUltimoMensaje(conv.mensajes)
        const mensajeCoincide = ultimoMensaje?.message?.toLowerCase().includes(busquedaLower) || false
        
        return nombreCoincide || telefonoCoincide || mensajeCoincide
      })
      setConversacionesFiltradas(resultados)
    }, 300)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [busqueda, conversaciones])

  // Efecto para cargar datos iniciales
  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const seleccionarConversacion = useCallback(async (telefono: string) => {
    try {
      setCargando(true)
      let mensajes = await obtenerMensajesConversacion(telefono)
      
      // Ordenamos los mensajes del más reciente al más antiguo
      mensajes = mensajes.sort((a, b) => {
        const fechaA = new Date(a.timestamp || 0).getTime()
        const fechaB = new Date(b.timestamp || 0).getTime()
        return fechaB - fechaA
      })
      
      const conversacion = conversaciones.find(c => c.telefono === telefono)
      if (conversacion) {
        setConversacionSeleccionada({
          ...conversacion,
          mensajes
        })
        // No necesitamos scroll al inicio ya que los mensajes más recientes estarán arriba
      }
    } catch (err) {
      console.error('Error en seleccionarConversacion:', err)
      setError('Error al cargar los mensajes')
    } finally {
      setCargando(false)
    }
  }, [conversaciones])

// Función para filtrar mensajes
const filtrarMensajes = useCallback((mensajes: MensajePB[] = [], tipo?: string) => {
  let mensajesFiltrados = [...mensajes] // Creamos una copia para no modificar el original
    
  // Primero ordenamos por fecha, del más reciente al más antiguo
  mensajesFiltrados.sort((a, b) => {
    const fechaA = new Date(a.timestamp || 0).getTime()
    const fechaB = new Date(b.timestamp || 0).getTime()
    return fechaB - fechaA // Orden descendente (más reciente primero)
  })
    
  // Luego aplicamos los filtros
  if (busquedaMensajes) {
    const busquedaLower = busquedaMensajes.toLowerCase().trim()
    mensajesFiltrados = mensajesFiltrados.filter(m => 
      m.message?.toLowerCase().includes(busquedaLower)
    )
  }

  if (tipo && tipo !== 'todos') {
    mensajesFiltrados = mensajesFiltrados.filter(m => {
      const mensaje = m.message?.toLowerCase() || ''
      switch (tipo) {
        case 'voz':
          return mensaje.includes('voice') || mensaje.includes('nota de voz')
        case 'imagenes':
          return mensaje.includes('image') || mensaje.includes('archivo multimedia')
        case 'documentos':
          return mensaje.includes('document') || mensaje.includes('documento')
        default:
          return true
      }
    })
  }

  return mensajesFiltrados
}, [busquedaMensajes])

  // Función para renderizar contenido multimedia
  const renderMediaContent = useCallback((mensaje: MensajePB) => {
    if (!mensaje.media) return null

    const mensajeLower = mensaje.message?.toLowerCase() || ''
    
    if (mensajeLower.includes('voice') || mensajeLower.includes('nota de voz')) {
      return (
        <MediaViewer
          key={`audio-${mensaje.id}`}
          collectionId={mensaje.collectionId}
          recordId={mensaje.id}
          fileName={mensaje.media}
          tipo="audio"
          onError={(error) => console.error('Error en nota de voz:', error)}
        />
      )
    }

    if (mensajeLower.includes('multimedia') || mensajeLower.includes('image')) {
      return (
        <MediaViewer
          key={`imagen-${mensaje.id}`}
          collectionId={mensaje.collectionId}
          recordId={mensaje.id}
          fileName={mensaje.media}
          tipo="imagen"
          onError={(error) => console.error('Error en imagen:', error)}
        />
      )
    }

    if (mensajeLower.includes('documento')) {
      return (
        <MediaViewer
          key={`documento-${mensaje.id}`}
          collectionId={mensaje.collectionId}
          recordId={mensaje.id}
          fileName={mensaje.media}
          tipo="documento"
          onError={(error) => console.error('Error en documento:', error)}
        />
      )
    }

    return null
  }, [])

  // Renderizado de error
  if (error) {
    return (
      <Card className="w-full max-w-3xl mx-auto">
        <CardContent className="p-8">
          <div className="text-center space-y-4">
            <p className="text-destructive font-medium">{error}</p>
            <Button 
              variant="outline" 
              onClick={() => {
                setError(null)
                cargarDatos()
              }}
            >
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Vista de detalle de conversación
  if (conversacionSeleccionada) {
    return (
      <Card className="w-full max-w-3xl mx-auto h-[85vh] flex flex-col">
        <CardHeader className="border-b shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => {
                setConversacionSeleccionada(null)
                setBusquedaMensajes('')
                setTabActual('todos')
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-lg font-semibold text-primary">
                  {conversacionSeleccionada.nombre.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold truncate">
                  {conversacionSeleccionada.nombre}
                </h2>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {conversacionSeleccionada.telefono}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Input
              placeholder="Buscar en mensajes..."
              value={busquedaMensajes}
              onChange={(e) => setBusquedaMensajes(e.target.value)}
              className="max-w-sm"
            />
            <Badge variant="secondary" className="h-6">
              <MessageSquare className="w-3 h-3 mr-1" />
              {conversacionSeleccionada.mensajes?.length || 0} mensajes
            </Badge>
          </div>
        </CardHeader>
        <Tabs 
          value={tabActual} 
          onValueChange={setTabActual}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full justify-start rounded-none border-b h-12 shrink-0">
            <TabsTrigger value="todos" className="flex-1">Todos</TabsTrigger>
            <TabsTrigger value="voz" className="flex-1">Notas de Voz</TabsTrigger>
            <TabsTrigger value="imagenes" className="flex-1">Imágenes</TabsTrigger>
            <TabsTrigger value="documentos" className="flex-1">Documentos</TabsTrigger>
          </TabsList>
          {['todos', 'voz', 'imagenes', 'documentos'].map(tipo => (
            <TabsContent 
              key={tipo} 
              value={tipo} 
              className="flex-1 min-h-0 mt-0"
            >
              <ScrollArea className="h-full">
                <div className="space-y-4 p-4">
                  {filtrarMensajes(conversacionSeleccionada.mensajes || [], tipo).map((mensaje) => (
                    <div
                      key={mensaje.id}
                      className="flex flex-col gap-2 bg-muted/30 rounded-lg p-4"
                    >
                      <span className="text-sm text-muted-foreground">
                        {mensaje.timestamp ? formatearFecha(mensaje.timestamp) : ''}
                      </span>
                      
                      {renderMediaContent(mensaje) || (
                        <p className="text-sm">{mensaje.message || ''}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    )
  }

  // Vista de lista de conversaciones
  return (
    <Card className="w-full max-w-3xl mx-auto h-[85vh] flex flex-col">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Conversaciones</h2>
          {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
        <div className="flex gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, teléfono o mensaje..."
              className="pl-8"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full">
          <div className="space-y-1 p-4">
            {conversacionesFiltradas.length === 0 ? (
              <div className="text-center p-4 text-muted-foreground">
                No se encontraron resultados
              </div>
            ) : (
              conversacionesFiltradas.map((conv) => (
                <div
                  key={conv.telefono}
                  className="group flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border border-transparent hover:border-border"
                  onClick={() => seleccionarConversacion(conv.telefono)}
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-lg font-semibold text-primary">
                      {conv.nombre?.charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{conv.nombre || 'Sin nombre'}</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="secondary" className="hidden group-hover:flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                <span>{conv.mensajes?.length || 0}</span>
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Total de mensajes
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-4 h-4 shrink-0" />
                      <span className="truncate">{conv.telefono}</span>
                    </div>

                    {/* Preview del último mensaje */}
                    <div className="mt-2">
                      <PreviewUltimoMensaje mensajes={conv.mensajes} />
                    </div>

                    {/* Contadores de tipos de mensajes */}
                    {conv.mensajes && conv.mensajes.length > 0 && (
                      <div className="mt-2">
                        <ContadorTipoMensajes mensajes={conv.mensajes} />
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      seleccionarConversacion(conv.telefono)
                    }}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}