import type {
  VideoModuleAPI,
  CompressResult,
  ProbeResult,
  ProgressPayload,
  SystemInfo
} from '../../shared/types'

declare global {
  interface PanelWindowBridge {
    video?: VideoModuleAPI
  }
  interface Window {
    panelApi?: PanelWindowBridge
  }
}

let progressListener: ((payload: ProgressPayload) => void) | null = null

export const isElectronVideo =
  typeof window !== 'undefined' && Boolean(window.panelApi?.video)

export const browserMockVideoApi: VideoModuleAPI = {
  async getSystemInfo(): Promise<SystemInfo> {
    return {
      ffmpegPath: 'ffmpeg (nativo en Electron)',
      ffmpegVersion: '6.0-static / GPU RTX',
      nvencAvailable: true,
      nvencModernPresets: true
    }
  },

  async selectFiles(): Promise<string[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.accept = 'video/mp4,video/x-matroska,video/quicktime,video/x-msvideo'
      input.onchange = () => {
        const files = Array.from(input.files ?? [])
        resolve(files.map((f) => (f as File & { path?: string }).path || f.name))
      }
      input.click()
    })
  },

  async selectFolder(): Promise<string | null> {
    return 'C:\\Videos\\FileDiet_Export'
  },

  async probeFiles(paths: string[]): Promise<ProbeResult[]> {
    return paths.map((p) => ({
      ok: true,
      info: {
        path: p,
        name: p.split(/[\\/]/).pop() ?? p,
        size: 1024 * 1024 * 780,
        duration: 185,
        width: 1920,
        height: 1080,
        codec: 'h264'
      }
    }))
  },

  async compress(request): Promise<CompressResult> {
    const inputSize = 1024 * 1024 * 780
    const outputSize = Math.round(inputSize * 0.28)

    for (let pct = 0; pct <= 100; pct += 5) {
      await new Promise((r) => setTimeout(r, 120))
      progressListener?.({
        jobId: request.jobId,
        percent: pct,
        fps: 145,
        etaSeconds: Math.max(0, Math.round(((100 - pct) / 100) * 8))
      })
    }

    return {
      ok: true,
      outputPath: request.inputPath.replace(/\.[^/.]+$/, '_compressed.mp4'),
      inputSize,
      outputSize
    }
  },

  async cancel(): Promise<boolean> {
    return true
  },

  async showInFolder(filePath: string): Promise<void> {
    console.log('[browser mock] Abrir carpeta de:', filePath)
  },

  getPathForFile(file: File): string {
    return (file as File & { path?: string }).path || file.name
  },

  onProgress(callback: (payload: ProgressPayload) => void): () => void {
    progressListener = callback
    return () => {
      progressListener = null
    }
  }
}

export function getVideoApi(): VideoModuleAPI {
  if (typeof window !== 'undefined' && window.panelApi?.video) {
    return window.panelApi.video
  }
  return browserMockVideoApi
}

