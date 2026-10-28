import type {
  BrandingConfig,
  DependencyStatus,
  HubAPI,
  HubAppSettings,
  ModuleStateSnapshot
} from '@panel/core-sdk'

declare global {
  interface PanelWindowBridge {
    hub?: HubAPI
  }
  interface Window {
    panelApi?: PanelWindowBridge
  }
}

let mockAppSettings: HubAppSettings = {
  closeToTray: true,
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
      },
      {
        name: 'Motor PDFKit Multipágina',
        description: 'Generador de documentos PDF A4 / Carta',
        ready: true
      }
    ]
  }
}

let stateListener: ((state: ModuleStateSnapshot) => void) | null = null

const browserMockHubApi: HubAPI = {
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => {},
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
  if (typeof window !== 'undefined' && window.panelApi?.hub) {
    return window.panelApi.hub
  }
  return browserMockHubApi
}
