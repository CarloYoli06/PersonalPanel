import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  HUB_IPC,
  type BackendModuleController,
  type DependencyStatus,
  type ModuleStateSnapshot
} from '@panel/core-sdk'
import { createVideoBackendController } from '@panel/mod-video/backend'
import { createScannerBackendController } from '@panel/mod-scanner/backend'
import { createOptimizerBackendController } from '@panel/mod-optimizer/backend'
import { createPdfBackendController } from '@panel/mod-pdf/backend'

interface PersistedHubConfig {
  enabledModules: Record<string, boolean>
}

const DEFAULT_ENABLED: Record<string, boolean> = {
  'mod-video': true,
  'mod-scanner': true,
  'mod-optimizer': true,
  'mod-pdf': true
}

export class ModuleHost {
  private controllers = new Map<string, BackendModuleController>()
  private enabledMap: Record<string, boolean> = { ...DEFAULT_ENABLED }
  private cachedDeps = new Map<string, DependencyStatus[]>()

  private getConfigFile(): string {
    return path.join(app.getPath('userData'), 'panel-hub-modules.json')
  }

  private loadConfig(): void {
    try {
      const raw = fs.readFileSync(this.getConfigFile(), 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedHubConfig>
      if (parsed.enabledModules) {
        this.enabledMap = { ...DEFAULT_ENABLED, ...parsed.enabledModules }
      }
    } catch {
      this.enabledMap = { ...DEFAULT_ENABLED }
    }
  }

  private saveConfig(): void {
    try {
      const payload: PersistedHubConfig = { enabledModules: this.enabledMap }
      fs.writeFileSync(this.getConfigFile(), JSON.stringify(payload, null, 2))
    } catch (e) {
      console.error('[ModuleHost] Error guardando configuración:', e)
    }
  }

  init(): void {
    this.loadConfig()

    const videoController = createVideoBackendController(() => this.broadcastState('mod-video'))
    const scannerController = createScannerBackendController(() =>
      this.broadcastState('mod-scanner')
    )
    const optimizerController = createOptimizerBackendController(() =>
      this.broadcastState('mod-optimizer')
    )
    const pdfController = createPdfBackendController(() => this.broadcastState('mod-pdf'))

    this.controllers.set(videoController.id, videoController)
    this.controllers.set(scannerController.id, scannerController)
    this.controllers.set(optimizerController.id, optimizerController)
    this.controllers.set(pdfController.id, pdfController)

    // Solo registramos IPC de los módulos habilitados.
    // Los binarios pesados (FFmpeg / PowerShell) NO se ejecutan aquí.
    for (const [id, controller] of this.controllers.entries()) {
      if (this.enabledMap[id] !== false) {
        controller.registerIpc()
      }
    }

    this.registerHubIpc()
  }

  private buildSnapshot(id: string): ModuleStateSnapshot {
    const controller = this.controllers.get(id)
    const enabled = this.enabledMap[id] !== false
    const deps = this.cachedDeps.get(id) ?? []
    const dependenciesReady =
      deps.length === 0 ? true : deps.filter((d) => !d.optional).every((d) => d.ready)

    if (!enabled || !controller) {
      return {
        id,
        enabled: false,
        running: false,
        statusText: 'Desactivado (0 recursos en uso)',
        dependenciesReady,
        dependencies: deps
      }
    }

    return {
      id,
      enabled: true,
      running: controller.isRunning(),
      statusText: controller.getStatusText(),
      dependenciesReady,
      dependencies: deps
    }
  }

  private broadcastState(id: string): void {
    const snap = this.buildSnapshot(id)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(HUB_IPC.moduleStateChanged, snap)
      }
    }
  }

  private registerHubIpc(): void {
    ipcMain.handle(HUB_IPC.modulesGetStates, () => {
      const out: Record<string, ModuleStateSnapshot> = {}
      for (const id of this.controllers.keys()) {
        out[id] = this.buildSnapshot(id)
      }
      return out
    })

    ipcMain.handle(
      HUB_IPC.moduleSetEnabled,
      async (_e, moduleId: string, enabled: boolean): Promise<ModuleStateSnapshot> => {
        const controller = this.controllers.get(moduleId)
        this.enabledMap[moduleId] = enabled
        this.saveConfig()

        if (controller) {
          if (enabled) {
            controller.registerIpc()
          } else {
            await controller.unregisterIpc()
          }
        }

        const snap = this.buildSnapshot(moduleId)
        this.broadcastState(moduleId)
        return snap
      }
    )

    ipcMain.handle(
      HUB_IPC.moduleCheckDeps,
      async (_e, moduleId: string): Promise<DependencyStatus[]> => {
        const controller = this.controllers.get(moduleId)
        if (!controller) return []
        const deps = await controller.checkDependencies()
        this.cachedDeps.set(moduleId, deps)
        this.broadcastState(moduleId)
        return deps
      }
    )

    ipcMain.handle(
      HUB_IPC.moduleStopProcesses,
      async (_e, moduleId: string): Promise<boolean> => {
        const controller = this.controllers.get(moduleId)
        if (!controller) return false
        await controller.killActiveProcesses()
        this.broadcastState(moduleId)
        return true
      }
    )
  }

  async shutdownAll(): Promise<void> {
    for (const controller of this.controllers.values()) {
      await controller.killActiveProcesses()
    }
  }
}

