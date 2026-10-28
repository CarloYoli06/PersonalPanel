/**
 * Contrato compartido de `mod-scanner` (Escaner Albedo) entre Main, Preload y Renderer.
 */

export const SCANNER_IPC = {
  configGet: 'mod-scanner:config:get',
  configSet: 'mod-scanner:config:set',
  configResetDevice: 'mod-scanner:config:reset-device',
  list: 'mod-scanner:list',
  scan: 'mod-scanner:scan',
  scanSmart: 'mod-scanner:scan-smart',
  saveImage: 'mod-scanner:file:save-image',
  savePdf: 'mod-scanner:file:save-pdf',
  readBase64: 'mod-scanner:file:read-base64',
  dialogSave: 'mod-scanner:dialog:save',
  dialogOpenFolder: 'mod-scanner:dialog:open-folder',
  getDocsPath: 'mod-scanner:app:get-docs-path',
  openPath: 'mod-scanner:shell:open-path'
} as const

export interface ScannerDevice {
  id: string
  name: string
  type: number
}

export interface ScannerConfig {
  deviceId?: string
  deviceName?: string
  dpi?: number
  colorMode?: number
}

export interface ScanOptions {
  deviceId?: string
  forceSelect?: boolean
  dpi?: number
  colorMode?: number
  brightness?: number
  contrast?: number
}

export interface ScanResponse {
  success: boolean
  cancelled?: boolean
  base64?: string
  tempPath?: string
  deviceId?: string
  deviceName?: string
  error?: string
}

export interface SaveImagePayload {
  base64: string
  destPath: string
}

export interface SavePdfPayload {
  imagePaths: string[]
  destPath: string
  pageSize: 'a4' | 'letter'
}

export interface FileOperationResult {
  success: boolean
  path?: string
  base64?: string
  error?: string
}

export interface ScannedPage {
  id: string
  base64: string
  tempPath: string
  editedBase64?: string
}

export interface ScannerModuleAPI {
  getConfig(): Promise<ScannerConfig>
  setConfig(data: Partial<ScannerConfig>): Promise<ScannerConfig>
  resetDevice(): Promise<boolean>
  listScanners(): Promise<ScannerDevice[]>
  scan(opts?: ScanOptions): Promise<ScanResponse>
  scanSmart(opts?: ScanOptions): Promise<ScanResponse>
  saveImage(data: SaveImagePayload): Promise<FileOperationResult>
  savePDF(data: SavePdfPayload): Promise<FileOperationResult>
  readBase64(filePath: string): Promise<FileOperationResult>
  showOpenFolder(): Promise<{ canceled: boolean; filePaths: string[] }>
  getDocsPath(): Promise<string>
  openPath(path: string): Promise<string>
}

