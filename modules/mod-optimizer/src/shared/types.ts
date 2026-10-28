export const OPTIMIZER_IPC = {
  getSystemMetrics: 'mod-optimizer:metrics:get',
  getStartupApps: 'mod-optimizer:startup:list',
  toggleStartupApp: 'mod-optimizer:startup:toggle',
  scanCleanableItems: 'mod-optimizer:clean:scan',
  executeCleaning: 'mod-optimizer:clean:execute',
  getTelemetryStatus: 'mod-optimizer:privacy:telemetry-status',
  applyPrivacyTweaks: 'mod-optimizer:privacy:apply',
  getVisualStatus: 'mod-optimizer:performance:visual-status',
  applyVisualTweaks: 'mod-optimizer:performance:apply',
  trimMemory: 'mod-optimizer:resources:trim-memory'
} as const

export interface SystemMetrics {
  cpuUsagePercent: number
  totalRamMb: number
  usedRamMb: number
  freeRamMb: number
  systemDriveFreeGb: number
  systemDriveTotalGb: number
}

export interface StartupApp {
  id: string
  name: string
  command: string
  location: 'HKCU' | 'HKLM' | 'StartupFolder'
  enabled: boolean
  impact: 'low' | 'medium' | 'high' | 'unknown'
}

export interface CleanableCategory {
  id: 'temp_user' | 'temp_windows' | 'prefetch' | 'windows_update'
  name: string
  description: string
  sizeBytes: number
  requiresAdmin: boolean
}

export interface PrivacyTweaksOptions {
  disableDiagTrack: boolean
  disableAdvertisingId: boolean
  disableFeedback: boolean
  disableCortana: boolean
}

export interface VisualTweaksOptions {
  disableWindowAnimations: boolean
  disableTransparency: boolean
  disableTaskbarAnimations: boolean
}

export interface OptimizerActionResult {
  success: boolean
  message: string
  freedBytes?: number
  error?: string
}

export interface OptimizerModuleAPI {
  getMetrics(): Promise<SystemMetrics>
  getStartupApps(): Promise<StartupApp[]>
  toggleStartupApp(
    appId: string,
    location: 'HKCU' | 'HKLM' | 'StartupFolder',
    enable: boolean
  ): Promise<OptimizerActionResult>
  scanCleanableItems(): Promise<CleanableCategory[]>
  executeCleaning(categoryIds: string[]): Promise<OptimizerActionResult>
  getTelemetryStatus(): Promise<PrivacyTweaksOptions>
  applyPrivacyTweaks(options: PrivacyTweaksOptions): Promise<OptimizerActionResult>
  getVisualStatus(): Promise<VisualTweaksOptions>
  applyVisualTweaks(options: VisualTweaksOptions): Promise<OptimizerActionResult>
  trimMemory(): Promise<OptimizerActionResult>
}

