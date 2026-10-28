import type { ScannerModuleAPI, ScannerConfig, ScanResponse } from '../../shared/types'

declare global {
  interface PanelWindowBridge {
    scanner?: ScannerModuleAPI
  }
  interface Window {
    panelApi?: PanelWindowBridge
  }
}

export const isElectronScanner =
  typeof window !== 'undefined' && Boolean(window.panelApi?.scanner)

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
  if (typeof window !== 'undefined' && window.panelApi?.scanner) {
    return window.panelApi.scanner
  }
  return browserMockScannerApi
}

