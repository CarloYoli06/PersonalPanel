import { invoke } from '@tauri-apps/api/core'
import type {
  FileOperationResult,
  SaveImagePayload,
  SavePdfPayload,
  ScanOptions,
  ScanResponse,
  ScannerConfig,
  ScannerDevice,
  ScannerModuleAPI
} from '../../shared/types'

declare global {
  interface PanelWindowBridge {
    scanner?: ScannerModuleAPI
  }
  interface Window {
    panelApi?: PanelWindowBridge
    __TAURI_INTERNALS__?: unknown
  }
}

export const isTauriScanner =
  typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

export const isElectronScanner =
  typeof window !== 'undefined' &&
  (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.panelApi?.scanner))

const tauriScannerApi: ScannerModuleAPI = {
  async getConfig(): Promise<ScannerConfig> {
    return invoke<ScannerConfig>('scanner_get_config')
  },
  async setConfig(data: Partial<ScannerConfig>): Promise<ScannerConfig> {
    return invoke<ScannerConfig>('scanner_set_config', { data })
  },
  async resetDevice(): Promise<boolean> {
    return invoke<boolean>('scanner_reset_device')
  },
  async listScanners(): Promise<ScannerDevice[]> {
    return invoke<ScannerDevice[]>('scanner_list')
  },
  async scan(opts?: ScanOptions): Promise<ScanResponse> {
    return invoke<ScanResponse>('scanner_scan', { opts: opts ?? {} })
  },
  async scanSmart(opts?: ScanOptions): Promise<ScanResponse> {
    return invoke<ScanResponse>('scanner_scan_smart', { opts: opts ?? {} })
  },
  async saveImage(data: SaveImagePayload): Promise<FileOperationResult> {
    return invoke<FileOperationResult>('scanner_save_image', { data })
  },
  async savePDF(data: SavePdfPayload): Promise<FileOperationResult> {
    return invoke<FileOperationResult>('scanner_save_pdf', { data })
  },
  async readBase64(filePath: string): Promise<FileOperationResult> {
    return invoke<FileOperationResult>('scanner_read_base64', { filePath })
  },
  async showOpenFolder(): Promise<{ canceled: boolean; filePaths: string[] }> {
    return invoke<{ canceled: boolean; filePaths: string[] }>('scanner_show_open_folder')
  },
  async getDocsPath(): Promise<string> {
    return invoke<string>('scanner_get_docs_path')
  },
  async openPath(path: string): Promise<string> {
    return invoke<string>('scanner_open_path', { path })
  }
}

let mockConfig: ScannerConfig = {
  deviceId: 'WIA-SIM-001',
  deviceName: 'Escáner WIA Simulado (Modo Web)',
  dpi: 300,
  colorMode: 2
}

function createSampleDocumentDataUrl(): string {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 960
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(50, 50, c.width - 100, c.height - 100)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 26px Inter, sans-serif'
  ctx.fillText('Escaner Albedo — Documento Digitalizado', 95, 130)
  ctx.fillStyle = '#475569'
  ctx.font = '16px Inter, sans-serif'
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(95, 185 + i * 42, i % 3 === 0 ? 440 : 510, 10)
  }
  return c.toDataURL('image/png')
}

export const browserMockScannerApi: ScannerModuleAPI = {
  async getConfig() {
    return mockConfig
  },
  async setConfig(d) {
    mockConfig = { ...mockConfig, ...d }
    return mockConfig
  },
  async resetDevice() {
    mockConfig = { ...mockConfig, deviceId: '', deviceName: '' }
    return true
  },
  async listScanners() {
    return [{ id: 'WIA-SIM-001', name: 'Escáner WIA Simulado', type: 1 }]
  },
  async scan(): Promise<ScanResponse> {
    await new Promise((r) => setTimeout(r, 700))
    return {
      success: true,
      base64: createSampleDocumentDataUrl(),
      tempPath: 'C:\\Temp\\scan_simulado.png',
      deviceId: 'WIA-SIM-001',
      deviceName: 'Escáner WIA Simulado'
    }
  },
  async scanSmart(): Promise<ScanResponse> {
    await new Promise((r) => setTimeout(r, 700))
    return {
      success: true,
      base64: createSampleDocumentDataUrl(),
      tempPath: 'C:\\Temp\\scan_simulado.png',
      deviceId: 'WIA-SIM-001',
      deviceName: 'Escáner WIA Simulado'
    }
  },
  async saveImage({ destPath }) {
    return { success: true, path: destPath }
  },
  async savePDF({ destPath }) {
    return { success: true, path: destPath }
  },
  async readBase64() {
    return { success: true, base64: createSampleDocumentDataUrl() }
  },
  async showOpenFolder() {
    return { canceled: false, filePaths: ['C:\\Documents\\EscanerAlbedo'] }
  },
  async getDocsPath() {
    return 'C:\\Documents\\EscanerAlbedo'
  },
  async openPath() {
    return ''
  }
}

export function getScannerApi(): ScannerModuleAPI {
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    return tauriScannerApi
  }
  if (typeof window !== 'undefined' && window.panelApi?.scanner) {
    return window.panelApi.scanner
  }
  return browserMockScannerApi
}
