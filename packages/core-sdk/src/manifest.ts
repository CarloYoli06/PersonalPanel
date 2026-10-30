import type { ComponentType, LazyExoticComponent } from 'react'
import type { ActivityReporter } from './activity'

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
  icon: 'video' | 'scan' | 'cpu' | 'sparkles' | 'wrench' | 'file-text'
  /** Color de acento primario para tarjetas e indicadores ('violet' | 'cyan' | 'emerald' | 'rose') */
  accent: 'violet' | 'cyan' | 'emerald' | 'rose'
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
   * Hook invocado cuando el módulo se monta (primera visita). Sigue montado al cambiar de pestaña.
   */
  onStart?: () => void | Promise<void>
  /**
   * Hook invocado cuando el módulo se desmonta (desactivado, sesión cerrada o procesos detenidos).
   */
  onStop?: () => void | Promise<void>
}

export interface ModuleViewProps {
  /** Permite al módulo navegar de vuelta al Hub */
  onNavigateHome?: () => void
  /** true cuando la pestaña del módulo está visible (los módulos visitados siguen montados en segundo plano) */
  isActive: boolean
  /** Canal para reportar trabajo en curso / terminado / error al Hub */
  activity: ActivityReporter
}
