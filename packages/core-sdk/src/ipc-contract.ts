import type { DependencyStatus, ModuleStateSnapshot } from './manifest'

/**
 * Canales IPC globales del Hub Principal y de los módulos desacoplados.
 */
export const HUB_IPC = {
  // Gestión de ventana y tema nativo
  windowMinimize: 'hub:window:minimize',
  windowMaximize: 'hub:window:maximize',
  windowClose: 'hub:window:close',
  themeSetNative: 'hub:theme:set-native',

  // Identidad visual / Icono personalizable + Bandeja del sistema (System Tray)
  appSetBranding: 'hub:app:set-branding',
  appGetSettings: 'hub:app:get-settings',
  appSetCloseToTray: 'hub:app:set-close-to-tray',
  trayNavigateToModule: 'hub:tray:navigate-to-module',

  // Gestión de módulos y estado en tiempo real
  modulesGetStates: 'hub:modules:get-states',
  moduleSetEnabled: 'hub:modules:set-enabled',
  moduleCheckDeps: 'hub:modules:check-deps',
  moduleStopProcesses: 'hub:modules:stop-processes',
  moduleStateChanged: 'hub:modules:state-changed'
} as const

export type ThemeMode = 'dark' | 'light' | 'system'

export interface BrandingConfig {
  mode: 'logo' | 'initials'
  initials: string
  color: string
  dataUrl?: string
}

export interface NotificationSettings {
  enabled: boolean
  onlyWhenUnfocused: boolean
}

export interface TrayLabels {
  header: string
  dashboard: string
  video: string
  scanner: string
  optimizer: string
  pdf: string
  settings: string
  keepBackground: string
  quit: string
  tooltip: string
}

export interface HubAppSettings {
  closeToTray: boolean
  branding: BrandingConfig
  notifications: NotificationSettings
}

export interface HubPreferences {
  theme: ThemeMode
  enabledModules: Record<string, boolean>
}

/**
 * Contrato para el backend de un módulo en el proceso principal de Electron.
 */
export interface BackendModuleController {
  id: string
  registerIpc: () => void
  unregisterIpc: () => Promise<void> | void
  killActiveProcesses: () => Promise<void> | void
  checkDependencies: () => Promise<DependencyStatus[]>
  isRunning: () => boolean
  getStatusText: () => string
}

export interface HubAPI {
  // Ventana y tema
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  isWindowMaximized?(): Promise<boolean>
  setNativeTheme(resolvedTheme: 'dark' | 'light'): void

  // Identidad visual (Logo vs Iniciales) y Bandeja de Sistema (Segundo plano)
  getAppSettings(): Promise<HubAppSettings>
  setBranding(branding: BrandingConfig): Promise<HubAppSettings>
  setCloseToTray(closeToTray: boolean): Promise<HubAppSettings>
  setNotifications(notifications: NotificationSettings): Promise<HubAppSettings>
  setTrayLabels(labels: TrayLabels): void
  onTrayNavigate(callback: (route: string) => void): () => void

  // Ventana: foco/visibilidad y progreso en la barra de tareas
  isWindowFocused?(): Promise<boolean>
  /** 0-100 para progreso determinado, -1 para indeterminado, null para quitarlo */
  setTaskbarProgress?(progress: number | null): void

  // Gestión de módulos
  getModuleStates(): Promise<Record<string, ModuleStateSnapshot>>
  setModuleEnabled(moduleId: string, enabled: boolean): Promise<ModuleStateSnapshot>
  checkModuleDependencies(moduleId: string): Promise<DependencyStatus[]>
  stopModuleProcesses(moduleId: string): Promise<boolean>
  onModuleStateChange(callback: (state: ModuleStateSnapshot) => void): () => void
}
