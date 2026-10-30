import { invoke } from '@tauri-apps/api/core'
import type {
  CleanableCategory,
  OptimizerActionResult,
  OptimizerModuleAPI,
  PrivacyTweaksOptions,
  StartupApp,
  SystemMetrics,
  VisualTweaksOptions
} from '../../shared/types'

declare global {
  interface PanelWindowBridge {
    optimizer?: OptimizerModuleAPI
  }
  interface Window {
    panelApi?: PanelWindowBridge
    __TAURI_INTERNALS__?: unknown
  }
}

export const isTauriOptimizer =
  typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

export const isElectronOptimizer =
  typeof window !== 'undefined' &&
  (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.panelApi?.optimizer))

const tauriOptimizerApi: OptimizerModuleAPI = {
  async getMetrics(): Promise<SystemMetrics> {
    return invoke<SystemMetrics>('optimizer_get_metrics')
  },
  async getStartupApps(): Promise<StartupApp[]> {
    return invoke<StartupApp[]>('optimizer_get_startup_apps')
  },
  async toggleStartupApp(
    appId: string,
    location: 'HKCU' | 'HKLM' | 'StartupFolder',
    enable: boolean
  ): Promise<OptimizerActionResult> {
    return invoke<OptimizerActionResult>('optimizer_toggle_startup_app', {
      appId,
      location,
      enable
    })
  },
  async scanCleanableItems(): Promise<CleanableCategory[]> {
    return invoke<CleanableCategory[]>('optimizer_scan_cleanable_items')
  },
  async executeCleaning(categoryIds: string[]): Promise<OptimizerActionResult> {
    return invoke<OptimizerActionResult>('optimizer_execute_cleaning', { categoryIds })
  },
  async getTelemetryStatus(): Promise<PrivacyTweaksOptions> {
    return invoke<PrivacyTweaksOptions>('optimizer_get_telemetry_status')
  },
  async applyPrivacyTweaks(options: PrivacyTweaksOptions): Promise<OptimizerActionResult> {
    return invoke<OptimizerActionResult>('optimizer_apply_privacy_tweaks', { options })
  },
  async getVisualStatus(): Promise<VisualTweaksOptions> {
    return invoke<VisualTweaksOptions>('optimizer_get_visual_status')
  },
  async applyVisualTweaks(options: VisualTweaksOptions): Promise<OptimizerActionResult> {
    return invoke<OptimizerActionResult>('optimizer_apply_visual_tweaks', { options })
  },
  async trimMemory(): Promise<OptimizerActionResult> {
    return invoke<OptimizerActionResult>('optimizer_trim_memory')
  }
}

export const browserMockOptimizerApi: OptimizerModuleAPI = {
  async getMetrics() {
    return {
      cpuUsagePercent: 18,
      totalRamMb: 16384,
      usedRamMb: 6840,
      freeRamMb: 9544,
      systemDriveFreeGb: 124.5,
      systemDriveTotalGb: 512.0
    }
  },
  async getStartupApps() {
    return [
      {
        id: 'Discord',
        name: 'Discord',
        command: 'C:\\Users\\User\\AppData\\Local\\Discord\\app.exe',
        location: 'HKCU',
        enabled: true,
        impact: 'high'
      },
      {
        id: 'Spotify',
        name: 'Spotify',
        command: 'C:\\Users\\User\\AppData\\Roaming\\Spotify\\Spotify.exe',
        location: 'HKCU',
        enabled: false,
        impact: 'medium'
      },
      {
        id: 'OneDrive',
        name: 'Microsoft OneDrive',
        command: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background',
        location: 'HKCU',
        enabled: true,
        impact: 'high'
      }
    ]
  },
  async toggleStartupApp(_id, _loc, enable) {
    return { success: true, message: `Aplicación ${enable ? 'habilitada' : 'deshabilitada'}` }
  },
  async scanCleanableItems() {
    return [
      {
        id: 'temp_user',
        name: 'Archivos Temporales de Usuario',
        description: 'Caché de navegadores y aplicaciones locales',
        sizeBytes: 1024 * 1024 * 1420,
        requiresAdmin: false
      },
      {
        id: 'temp_windows',
        name: 'Temporales de Windows',
        description: 'Archivos temporales del sistema operativo',
        sizeBytes: 1024 * 1024 * 680,
        requiresAdmin: true
      },
      {
        id: 'prefetch',
        name: 'Caché Prefetch',
        description: 'Índice de precarga de ejecutables',
        sizeBytes: 1024 * 1024 * 120,
        requiresAdmin: true
      },
      {
        id: 'windows_update',
        name: 'Descargas de Windows Update',
        description: 'Parches y paquetes de actualización ya aplicados',
        sizeBytes: 1024 * 1024 * 2450,
        requiresAdmin: true
      }
    ]
  },
  async executeCleaning(targets) {
    await new Promise((r) => setTimeout(r, 800))
    return {
      success: true,
      message: 'Limpieza completada con éxito',
      freedBytes: targets.length * 1024 * 1024 * 500
    }
  },
  async getTelemetryStatus() {
    return {
      disableDiagTrack: true,
      disableAdvertisingId: true,
      disableFeedback: true,
      disableCortana: true
    }
  },
  async applyPrivacyTweaks(_options: PrivacyTweaksOptions): Promise<OptimizerActionResult> {
    await new Promise((r) => setTimeout(r, 600))
    return { success: true, message: 'Ajustes de privacidad y telemetría aplicados' }
  },
  async getVisualStatus() {
    return {
      disableWindowAnimations: true,
      disableTransparency: false,
      disableTaskbarAnimations: true
    }
  },
  async applyVisualTweaks(_options: VisualTweaksOptions): Promise<OptimizerActionResult> {
    await new Promise((r) => setTimeout(r, 500))
    return { success: true, message: 'Ajustes de rendimiento visual guardados' }
  },
  async trimMemory() {
    await new Promise((r) => setTimeout(r, 700))
    return { success: true, message: 'Memoria RAM liberada y optimizada' }
  }
}

export function getOptimizerApi(): OptimizerModuleAPI {
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    return tauriOptimizerApi
  }
  if (typeof window !== 'undefined' && window.panelApi?.optimizer) {
    return window.panelApi.optimizer
  }
  return browserMockOptimizerApi
}
