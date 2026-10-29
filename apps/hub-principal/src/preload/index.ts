import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  HUB_IPC,
  type BrandingConfig,
  type HubAPI,
  type ModuleStateSnapshot
} from '@panel/core-sdk'
import {
  VIDEO_IPC,
  type VideoModuleAPI,
  type ProgressPayload
} from '@panel/mod-video/shared/types'
import { SCANNER_IPC, type ScannerModuleAPI } from '@panel/mod-scanner/shared/types'
import { OPTIMIZER_IPC, type OptimizerModuleAPI } from '@panel/mod-optimizer/shared/types'
import { PDF_IPC, type PdfModuleAPI } from '@panel/mod-pdf/shared/types'

const hubApi: HubAPI = {
  minimizeWindow: () => ipcRenderer.send(HUB_IPC.windowMinimize),
  maximizeWindow: () => ipcRenderer.send(HUB_IPC.windowMaximize),
  closeWindow: () => ipcRenderer.send(HUB_IPC.windowClose),
  setNativeTheme: (resolved) => ipcRenderer.send(HUB_IPC.themeSetNative, resolved),

  getAppSettings: () => ipcRenderer.invoke(HUB_IPC.appGetSettings),
  setBranding: (branding: BrandingConfig) =>
    ipcRenderer.invoke(HUB_IPC.appSetBranding, branding),
  setCloseToTray: (closeToTray: boolean) =>
    ipcRenderer.invoke(HUB_IPC.appSetCloseToTray, closeToTray),
  onTrayNavigate: (callback) => {
    const listener = (_e: IpcRendererEvent, route: string): void => callback(route)
    ipcRenderer.on(HUB_IPC.trayNavigateToModule, listener)
    return () => {
      ipcRenderer.removeListener(HUB_IPC.trayNavigateToModule, listener)
    }
  },

  getModuleStates: () => ipcRenderer.invoke(HUB_IPC.modulesGetStates),
  setModuleEnabled: (moduleId, enabled) =>
    ipcRenderer.invoke(HUB_IPC.moduleSetEnabled, moduleId, enabled),
  checkModuleDependencies: (moduleId) => ipcRenderer.invoke(HUB_IPC.moduleCheckDeps, moduleId),
  stopModuleProcesses: (moduleId) => ipcRenderer.invoke(HUB_IPC.moduleStopProcesses, moduleId),
  onModuleStateChange: (callback) => {
    const listener = (_e: IpcRendererEvent, state: ModuleStateSnapshot): void => callback(state)
    ipcRenderer.on(HUB_IPC.moduleStateChanged, listener)
    return () => {
      ipcRenderer.removeListener(HUB_IPC.moduleStateChanged, listener)
    }
  }
}

const videoApi: VideoModuleAPI = {
  selectFiles: () => ipcRenderer.invoke(VIDEO_IPC.selectFiles),
  selectFolder: () => ipcRenderer.invoke(VIDEO_IPC.selectFolder),
  probeFiles: (paths) => ipcRenderer.invoke(VIDEO_IPC.probe, paths),
  compress: (request) => ipcRenderer.invoke(VIDEO_IPC.compress, request),
  cancel: () => ipcRenderer.invoke(VIDEO_IPC.cancel),
  getSystemInfo: () => ipcRenderer.invoke(VIDEO_IPC.systemInfo),
  showInFolder: (filePath) => ipcRenderer.invoke(VIDEO_IPC.showItem, filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: ProgressPayload): void => callback(payload)
    ipcRenderer.on(VIDEO_IPC.progress, listener)
    return () => {
      ipcRenderer.removeListener(VIDEO_IPC.progress, listener)
    }
  }
}

const scannerApi: ScannerModuleAPI = {
  getConfig: () => ipcRenderer.invoke(SCANNER_IPC.configGet),
  setConfig: (d) => ipcRenderer.invoke(SCANNER_IPC.configSet, d),
  resetDevice: () => ipcRenderer.invoke(SCANNER_IPC.configResetDevice),
  listScanners: () => ipcRenderer.invoke(SCANNER_IPC.list),
  scan: (opts) => ipcRenderer.invoke(SCANNER_IPC.scan, opts),
  scanSmart: (opts) => ipcRenderer.invoke(SCANNER_IPC.scanSmart, opts),
  saveImage: (data) => ipcRenderer.invoke(SCANNER_IPC.saveImage, data),
  savePDF: (data) => ipcRenderer.invoke(SCANNER_IPC.savePdf, data),
  readBase64: (filePath) => ipcRenderer.invoke(SCANNER_IPC.readBase64, filePath),
  showOpenFolder: () => ipcRenderer.invoke(SCANNER_IPC.dialogOpenFolder),
  getDocsPath: () => ipcRenderer.invoke(SCANNER_IPC.getDocsPath),
  openPath: (p) => ipcRenderer.invoke(SCANNER_IPC.openPath, p)
}

const optimizerApi: OptimizerModuleAPI = {
  getMetrics: () => ipcRenderer.invoke(OPTIMIZER_IPC.getSystemMetrics),
  getStartupApps: () => ipcRenderer.invoke(OPTIMIZER_IPC.getStartupApps),
  toggleStartupApp: (appId, location, enable) =>
    ipcRenderer.invoke(OPTIMIZER_IPC.toggleStartupApp, appId, location, enable),
  scanCleanableItems: () => ipcRenderer.invoke(OPTIMIZER_IPC.scanCleanableItems),
  executeCleaning: (categoryIds) => ipcRenderer.invoke(OPTIMIZER_IPC.executeCleaning, categoryIds),
  getTelemetryStatus: () => ipcRenderer.invoke(OPTIMIZER_IPC.getTelemetryStatus),
  applyPrivacyTweaks: (options) => ipcRenderer.invoke(OPTIMIZER_IPC.applyPrivacyTweaks, options),
  getVisualStatus: () => ipcRenderer.invoke(OPTIMIZER_IPC.getVisualStatus),
  applyVisualTweaks: (options) => ipcRenderer.invoke(OPTIMIZER_IPC.applyVisualTweaks, options),
  trimMemory: () => ipcRenderer.invoke(OPTIMIZER_IPC.trimMemory)
}

const pdfApi: PdfModuleAPI = {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  selectPdfFiles: (multiple) => ipcRenderer.invoke(PDF_IPC.selectPdfFiles, multiple),
  selectImageFiles: () => ipcRenderer.invoke(PDF_IPC.selectImageFiles),
  selectOutputFolder: (defaultPath) => ipcRenderer.invoke(PDF_IPC.selectOutputFolder, defaultPath),
  inspectPdfs: (filePaths) => ipcRenderer.invoke(PDF_IPC.inspectPdfs, filePaths),
  inspectImages: (filePaths) => ipcRenderer.invoke(PDF_IPC.inspectImages, filePaths),
  readPdfBytes: (filePath) => ipcRenderer.invoke(PDF_IPC.readPdfBytes, filePath),
  readImageDataUrl: (filePath, maxPreviewPx) =>
    ipcRenderer.invoke(PDF_IPC.readImageDataUrl, filePath, maxPreviewPx),
  mergePdfs: (req) => ipcRenderer.invoke(PDF_IPC.mergePdfs, req),
  splitPdf: (req) => ipcRenderer.invoke(PDF_IPC.splitPdf, req),
  organizePdf: (req) => ipcRenderer.invoke(PDF_IPC.organizePdf, req),
  compressPdf: (req) => ipcRenderer.invoke(PDF_IPC.compressPdf, req),
  imagesToPdf: (req) => ipcRenderer.invoke(PDF_IPC.imagesToPdf, req),
  saveExportedImages: (req) => ipcRenderer.invoke(PDF_IPC.saveExportedImages, req),
  stampPdf: (req) => ipcRenderer.invoke(PDF_IPC.stampPdf, req),
  updateMetadataAndSecurity: (req) => ipcRenderer.invoke(PDF_IPC.updateMetadataAndSecurity, req),
  revealInFolder: (targetPath) => ipcRenderer.invoke(PDF_IPC.revealInFolder, targetPath),
  openFile: (targetPath) => ipcRenderer.invoke(PDF_IPC.openFile, targetPath)
}

contextBridge.exposeInMainWorld('panelApi', {
  hub: hubApi,
  video: videoApi,
  scanner: scannerApi,
  optimizer: optimizerApi,
  pdf: pdfApi
})
