/**
 * Contrato compartido de `mod-video` (FileDiet) entre Main, Preload y Renderer.
 */

export const VIDEO_IPC = {
  selectFiles: 'mod-video:dialog:select-files',
  selectFolder: 'mod-video:dialog:select-folder',
  probe: 'mod-video:probe',
  compress: 'mod-video:compress',
  cancel: 'mod-video:cancel',
  progress: 'mod-video:progress',
  systemInfo: 'mod-video:system:info',
  showItem: 'mod-video:shell:show-item'
} as const

export const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'mov', 'avi'] as const

export type Engine = 'nvenc' | 'x264'
export type CompressionLevel = 'high' | 'balanced' | 'max'
export type OutputMode = 'same' | 'custom'

/** Valor CRF (x264) / CQ (NVENC) por nivel y motor. */
export const LEVEL_QUALITY: Record<Engine, Record<CompressionLevel, number>> = {
  nvenc: {
    high: 20,
    balanced: 24,
    max: 28
  },
  x264: {
    high: 20,
    balanced: 23,
    max: 28
  }
}

export interface CompressionSettings {
  engine: Engine
  level: CompressionLevel
  outputMode: OutputMode
  outputDir: string | null
  limitTo1080p: boolean
}

export interface VideoInfo {
  path: string
  name: string
  size: number
  duration: number
  width: number
  height: number
  codec: string
}

export type ProbeResult =
  | { ok: true; info: VideoInfo }
  | { ok: false; path: string; name: string; size: number; error: string }

export interface CompressRequest {
  jobId: string
  inputPath: string
  settings: CompressionSettings
}

export type CompressResult =
  | { ok: true; outputPath: string; inputSize: number; outputSize: number }
  | { ok: false; cancelled: boolean; error: string }

export interface ProgressPayload {
  jobId: string
  percent: number
  fps: number | null
  etaSeconds: number | null
}

export interface SystemInfo {
  ffmpegPath: string
  ffmpegVersion: string
  nvencAvailable: boolean
  nvencModernPresets: boolean
}

export type JobStatus = 'pending' | 'compressing' | 'done' | 'error' | 'cancelled'

export interface Job {
  id: string
  path: string
  name: string
  size: number
  duration: number
  width: number
  height: number
  codec: string
  status: JobStatus
  progress: number
  fps: number | null
  etaSeconds: number | null
  outputPath?: string
  outputSize?: number
  error?: string
}

export interface VideoModuleAPI {
  selectFiles(): Promise<string[]>
  selectFolder(): Promise<string | null>
  probeFiles(paths: string[]): Promise<ProbeResult[]>
  compress(request: CompressRequest): Promise<CompressResult>
  cancel(): Promise<boolean>
  getSystemInfo(): Promise<SystemInfo>
  showInFolder(path: string): Promise<void>
  getPathForFile(file: File): string
  onProgress(callback: (payload: ProgressPayload) => void): () => void
}

