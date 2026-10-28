import type { ComponentType, LazyExoticComponent } from 'react'

export type ModuleCategory = 'media' | 'documents' | 'utilities' | 'system'

export type ModuleRuntimeStatus = 'idle' | 'running' | 'disabled' | 'missing-deps' | 'error'

export interface DependencyStatus {
  name: string
  description: string
  ready: boolean
  version?: string
  binaryPath?: string
  optional?: boolean
}

export interface ModuleStateSnapshot {
  id: string
  enabled: boolean
  running: boolean
  statusText: string
  progress?: number | null
  dependenciesReady: boolean
  dependencies: DependencyStatus[]
}

/**
 * Contrato estándar (ModuleManifest) que cada módulo en `modules/*` debe exportar
 * para que el Panel Principal (Hub) lo descubra, gestione su ciclo de vida
 * y cargue su vista únicamente bajo demanda (Lazy Loading).
 */
export interface ModuleManifest {
  /** Identificador único del módulo (ej. 'mod-video', 'mod-scanner') */
  id: string
  /** Nombre visible del módulo */
  name: string
  /** Subtítulo corto */
  tagline: string
  /** Descripción detallada para el Dashboard y ajustes */
  description: string
  /** Versión semántica */
  version: string
  /** Categoría funcional */
  category: ModuleCategory
  /** Identificador de icono (Lucide icon name) */
  icon: 'video' | 'scan' | 'cpu' | 'sparkles' | 'wrench'
  /** Color de acento primario para tarjetas e indicadores ('violet' | 'cyan' | 'emerald') */
  accent: 'violet' | 'cyan' | 'emerald'
  /** Estado por defecto al instalar por primera vez */
  defaultEnabled: boolean
  /** Lista descriptiva de binarios o drivers externos que utiliza bajo demanda */
  externalBinaries: string[]
  /**
   * Punto de entrada Lazy de React.
   * Garantiza 0 consumo de RAM cuando el módulo no está abierto en pantalla.
   */
  entryPoint: LazyExoticComponent<ComponentType<ModuleViewProps>>
  /**
   * Hook invocado cuando el usuario abre o activa el módulo.
   */
  onStart?: () => void | Promise<void>
  /**
   * Hook invocado cuando el usuario sale del módulo o lo desactiva.
   */
  onStop?: () => void | Promise<void>
}

export interface ModuleViewProps {
  /** Permite al módulo navegar de vuelta al Hub */
  onNavigateHome?: () => void
  /** Permite al módulo reportar su actividad al Hub */
  onStatusChange?: (running: boolean, statusText?: string) => void
}

