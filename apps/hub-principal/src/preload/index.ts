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

contextBridge.exposeInMainWorld('panelApi', {
  hub: hubApi,
  video: videoApi,
  scanner: scannerApi
})
