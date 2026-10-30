import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window'
import {
  HUB_IPC,
  type BrandingConfig,
  type DependencyStatus,
  type HubAPI,
  type HubAppSettings,
  type ModuleStateSnapshot,
  type NotificationSettings,
  type TrayLabels
} from '@panel/core-sdk'

declare global {
  interface PanelWindowBridge {
    hub?: HubAPI
  }
  interface Window {
    panelApi?: PanelWindowBridge
    __TAURI_INTERNALS__?: unknown
  }
}

export const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

let mockAppSettings: HubAppSettings = {
  closeToTray: true,
  notifications: { enabled: true, onlyWhenUnfocused: true },
  branding: {
    mode: 'logo',
    initials: 'PA',
    color: '#8b5cf6'
  }
}

const mockStates: Record<string, ModuleStateSnapshot> = {
  'mod-video': {
    id: 'mod-video',
    enabled: true,
    running: false,
    statusText: 'Listo (0 MB en reposo)',
    dependenciesReady: true,
    dependencies: [
      {
        name: 'FFmpeg Engine (x64)',
        description: 'Motor de codificación H.264 / NVENC bajo demanda',
        ready: true,
        version: '6.0-static'
      },
      {
        name: 'FFprobe Analyzer',
        description: 'Inspector de streams de video',
        ready: true
      }
    ]
  },
  'mod-scanner': {
    id: 'mod-scanner',
    enabled: true,
    running: false,
    statusText: 'Listo (0 MB en reposo)',
    dependenciesReady: true,
    dependencies: [
      {
        name: 'Windows WIA / PowerShell STA Bridge',
        description: 'Subproceso efímero bajo demanda para escáneres USB y WiFi',
        ready: true
      }
    ]
  },
  'mod-optimizer': {
    id: 'mod-optimizer',
    enabled: true,
    running: false,
    statusText: 'Listo (0 MB en reposo)',
    dependenciesReady: true,
    dependencies: [
      {
        name: 'PowerShell System Optimizer',
        description: 'Ejecutor aislado sin consola para telemetría y caché',
        ready: true
      }
    ]
  },
  'mod-pdf': {
    id: 'mod-pdf',
    enabled: true,
    running: false,
    statusText: 'Listo (0 MB en reposo)',
    dependenciesReady: true,
    dependencies: [
      {
        name: 'Motor PDF Nativo (Rust + PDF.js)',
        description: 'Manipulación de documentos PDF e inspección local',
        ready: true
      }
    ]
  }
}

let stateListener: ((state: ModuleStateSnapshot) => void) | null = null

const tauriHubApi: HubAPI = {
  minimizeWindow: () => {
    void invoke('hub_window_minimize')
  },
  maximizeWindow: () => {
    void invoke('hub_window_maximize')
  },
  closeWindow: () => {
    void invoke('hub_window_close')
  },
  isWindowMaximized: async (): Promise<boolean> => {
    return invoke<boolean>('hub_window_is_maximized')
  },
  setNativeTheme: (resolvedTheme: 'dark' | 'light') => {
    void invoke('hub_theme_set_native', { resolvedTheme })
  },
  async getAppSettings(): Promise<HubAppSettings> {
    return invoke<HubAppSettings>('hub_app_get_settings')
  },
  async setBranding(branding: BrandingConfig): Promise<HubAppSettings> {
    return invoke<HubAppSettings>('hub_app_set_branding', { branding })
  },
  async setCloseToTray(closeToTray: boolean): Promise<HubAppSettings> {
    return invoke<HubAppSettings>('hub_app_set_close_to_tray', { closeToTray })
  },
  async setNotifications(notifications: NotificationSettings): Promise<HubAppSettings> {
    return invoke<HubAppSettings>('hub_app_set_notifications', { notifications })
  },
  setTrayLabels(labels: TrayLabels): void {
    void invoke('hub_tray_set_labels', { labels })
  },
  async isWindowFocused(): Promise<boolean> {
    const win = getCurrentWindow()
    const [focused, visible, minimized] = await Promise.all([
      win.isFocused(),
      win.isVisible(),
      win.isMinimized()
    ])
    return focused && visible && !minimized
  },
  setTaskbarProgress(progress: number | null): void {
    const status =
      progress === null ? ProgressBarStatus.None : progress < 0 ? ProgressBarStatus.Indeterminate : ProgressBarStatus.Normal
    void getCurrentWindow()
      .setProgressBar({
        status,
        ...(progress !== null && progress >= 0 ? { progress: Math.round(progress) } : {})
      })
      .catch(() => {})
  },
  onTrayNavigate(callback: (route: string) => void): () => void {
    let unlisten: UnlistenFn | null = null
    let active = true

    void listen<string>(HUB_IPC.trayNavigateToModule, (event) => {
      if (active) callback(event.payload)
    }).then((fn) => {
      if (!active) fn()
      else unlisten = fn
    })

    return () => {
      active = false
      unlisten?.()
    }
  },
  async getModuleStates(): Promise<Record<string, ModuleStateSnapshot>> {
    return invoke<Record<string, ModuleStateSnapshot>>('hub_modules_get_states')
  },
  async setModuleEnabled(moduleId: string, enabled: boolean): Promise<ModuleStateSnapshot> {
    return invoke<ModuleStateSnapshot>('hub_modules_set_enabled', { moduleId, enabled })
  },
  async checkModuleDependencies(moduleId: string): Promise<DependencyStatus[]> {
    return invoke<DependencyStatus[]>('hub_modules_check_deps', { moduleId })
  },
  async stopModuleProcesses(moduleId: string): Promise<boolean> {
    return invoke<boolean>('hub_modules_stop_processes', { moduleId })
  },
  onModuleStateChange(callback: (state: ModuleStateSnapshot) => void): () => void {
    let unlisten: UnlistenFn | null = null
    let active = true

    void listen<ModuleStateSnapshot>(HUB_IPC.moduleStateChanged, (event) => {
      if (active) callback(event.payload)
    }).then((fn) => {
      if (!active) fn()
      else unlisten = fn
    })

    return () => {
      active = false
      unlisten?.()
    }
  }
}

const browserMockHubApi: HubAPI = {
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => {},
  isWindowMaximized: async () => false,
  setNativeTheme: () => {},
  async getAppSettings(): Promise<HubAppSettings> {
    return mockAppSettings
  },
  async setBranding(branding: BrandingConfig): Promise<HubAppSettings> {
    mockAppSettings = { ...mockAppSettings, branding }
    return mockAppSettings
  },
  async setCloseToTray(closeToTray: boolean): Promise<HubAppSettings> {
    mockAppSettings = { ...mockAppSettings, closeToTray }
    return mockAppSettings
  },
  async setNotifications(notifications: NotificationSettings): Promise<HubAppSettings> {
    mockAppSettings = { ...mockAppSettings, notifications }
    return mockAppSettings
  },
  setTrayLabels: () => {},
  isWindowFocused: async () => document.hasFocus(),
  setTaskbarProgress: () => {},
  onTrayNavigate() {
    return () => {}
  },
  async getModuleStates() {
    return { ...mockStates }
  },
  async setModuleEnabled(moduleId: string, enabled: boolean): Promise<ModuleStateSnapshot> {
    const prev = mockStates[moduleId] ?? {
      id: moduleId,
      enabled,
      running: false,
      statusText: '',
      dependenciesReady: true,
      dependencies: []
    }
    const next: ModuleStateSnapshot = {
      ...prev,
      enabled,
      running: false,
      statusText: enabled ? 'Listo (0 MB en reposo)' : 'Desactivado (0 recursos en uso)'
    }
    mockStates[moduleId] = next
    stateListener?.(next)
    return next
  },
  async checkModuleDependencies(moduleId: string): Promise<DependencyStatus[]> {
    return mockStates[moduleId]?.dependencies ?? []
  },
  async stopModuleProcesses(moduleId: string): Promise<boolean> {
    if (mockStates[moduleId]) {
      mockStates[moduleId] = {
        ...mockStates[moduleId],
        running: false,
        statusText: 'Listo (0 MB en reposo)'
      }
      stateListener?.(mockStates[moduleId])
    }
    return true
  },
  onModuleStateChange(cb) {
    stateListener = cb
    return () => {
      stateListener = null
    }
  }
}

export function getHubApi(): HubAPI {
  if (isTauriRuntime()) {
    return tauriHubApi
  }
  if (typeof window !== 'undefined' && window.panelApi?.hub) {
    return window.panelApi.hub
  }
  return browserMockHubApi
}
