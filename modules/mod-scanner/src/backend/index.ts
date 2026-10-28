import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  IsolatedProcessTracker,
  type BackendModuleController,
  type DependencyStatus
} from '@panel/core-sdk'
import {
  SCANNER_IPC,
  type ScannerConfig,
  type ScannerDevice,
  type ScanOptions,
  type ScanResponse,
  type SaveImagePayload,
  type SavePdfPayload,
  type FileOperationResult
} from '../shared/types'

function resolveScriptsDir(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'scripts'),
    path.resolve(process.cwd(), 'modules/mod-scanner/scripts'),
    path.resolve(process.cwd(), '../../modules/mod-scanner/scripts'),
    path.resolve(__dirname, '../../../modules/mod-scanner/scripts'),
    path.resolve(__dirname, '../../scripts')
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[1]
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function createScannerBackendController(
  onActivityChange?: () => void
): BackendModuleController {
  const processTracker = new IsolatedProcessTracker()
  let registered = false
  let activeTaskLabel: string | null = null

  const getConfigPath = (): string => path.join(app.getPath('userData'), 'albedo-config.json')
  const getTempDir = (): string => path.join(app.getPath('temp'), 'EscanerAlbedo')

  function readConfig(): ScannerConfig {
    try {
      return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) as ScannerConfig
    } catch {
      return {}
    }
  }

  function writeConfig(data: Partial<ScannerConfig>): void {
    try {
      const c = readConfig()
      fs.writeFileSync(getConfigPath(), JSON.stringify({ ...c, ...data }, null, 2))
    } catch (e) {
      console.error('[mod-scanner] Config write error:', e)
    }
  }

  async function runPowerShell(
    scriptPath: string,
    params: Record<string, string | number> = {},
    interactive = false
  ): Promise<string> {
    const args = interactive
      ? ['-Sta', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
      : ['-Sta', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]

    for (const [k, v] of Object.entries(params)) {
      args.push(`-${k}`, String(v))
    }

    const res = await processTracker.spawnAsync('powershell.exe', args, {
      windowsHide: !interactive
    })
    if (!res.ok) {
      throw new Error(res.stderr || `PowerShell finalizó con código ${res.code}`)
    }
    return res.stdout
  }

  return {
    id: 'mod-scanner',

    registerIpc() {
      if (registered) return
      registered = true

      ipcMain.handle(SCANNER_IPC.configGet, () => readConfig())
      ipcMain.handle(SCANNER_IPC.configSet, (_e, d: Partial<ScannerConfig>) => {
        writeConfig(d)
        return readConfig()
      })
      ipcMain.handle(SCANNER_IPC.configResetDevice, () => {
        writeConfig({ deviceId: '', deviceName: '' })
        return true
      })

      ipcMain.handle(SCANNER_IPC.list, async (): Promise<ScannerDevice[]> => {
        try {
          activeTaskLabel = 'Buscando escáneres WIA…'
          onActivityChange?.()
          const scriptsDir = resolveScriptsDir()
          const raw = await runPowerShell(path.join(scriptsDir, 'list-scanners.ps1'))
          if (!raw || raw === 'null') return []
          const parsed = JSON.parse(raw)
          return Array.isArray(parsed) ? parsed : [parsed]
        } catch (e) {
          console.error('[mod-scanner] list error:', e)
          return []
        } finally {
          activeTaskLabel = null
          onActivityChange?.()
        }
      })

      ipcMain.handle(
        SCANNER_IPC.scanSmart,
        async (event, opts: ScanOptions = {}): Promise<ScanResponse> => {
          const win = BrowserWindow.fromWebContents(event.sender)
          const tempDir = getTempDir()
          ensureDir(tempDir)
          const ts = Date.now()
          const out = path.join(tempDir, `scan_${ts}.png`)

          const cfg = readConfig()
          const savedId = opts.forceSelect ? '' : cfg.deviceId || ''
          const needDialog = !savedId

          activeTaskLabel = needDialog
            ? 'Esperando selección de escáner…'
            : 'Escaneando documento (WIA)…'
          onActivityChange?.()

          try {
            if (needDialog && win) {
              win.setAlwaysOnTop(false)
              win.minimize()
              await new Promise((r) => setTimeout(r, 400))
            }

            const params: Record<string, string | number> = {
              OutputPath: out,
              DPI: opts.dpi ?? cfg.dpi ?? 300,
              ColorMode: opts.colorMode ?? cfg.colorMode ?? 2,
              Brightness: opts.brightness ?? 0,
              Contrast: opts.contrast ?? 0
            }
            if (savedId) params.DeviceId = savedId

            const scriptsDir = resolveScriptsDir()
            let raw: string
            try {
              raw = await runPowerShell(
                path.join(scriptsDir, 'scan-with-select.ps1'),
                params,
                needDialog
              )
            } finally {
              if (needDialog && win && !win.isDestroyed()) {
                win.restore()
                win.focus()
              }
            }

            const json = JSON.parse(raw) as {
              success: boolean
              path: string
              deviceId: string
              deviceName: string
              error: string
            }

            if (json.error === 'CANCELLED') return { success: false, cancelled: true }
            if (!json.success) return { success: false, error: json.error }

            if (json.deviceId) {
              writeConfig({ deviceId: json.deviceId, deviceName: json.deviceName })
            }

            const buf = fs.readFileSync(json.path)
            const base64 = 'data:image/png;base64,' + buf.toString('base64')
            return {
              success: true,
              base64,
              tempPath: json.path,
              deviceId: json.deviceId,
              deviceName: json.deviceName
            }
          } catch (e) {
            if (win && !win.isDestroyed()) {
              try {
                win.restore()
                win.focus()
              } catch {
                /* ignore */
              }
            }
            return { success: false, error: e instanceof Error ? e.message : String(e) }
          } finally {
            activeTaskLabel = null
            onActivityChange?.()
          }
        }
      )

      ipcMain.handle(
        SCANNER_IPC.scan,
        async (_e, opts: ScanOptions = {}): Promise<ScanResponse> => {
          const tempDir = getTempDir()
          ensureDir(tempDir)
          const ts = Date.now()
          const out = path.join(tempDir, `scan_${ts}.png`)
          const params: Record<string, string | number> = {
            OutputPath: out,
            DPI: opts.dpi ?? 300,
            ColorMode: opts.colorMode ?? 2,
            Brightness: opts.brightness ?? 0,
            Contrast: opts.contrast ?? 0
          }
          if (opts.deviceId) params.DeviceId = opts.deviceId

          activeTaskLabel = 'Escaneando documento (WIA)…'
          onActivityChange?.()
          try {
            const scriptsDir = resolveScriptsDir()
            const raw = await runPowerShell(path.join(scriptsDir, 'scan.ps1'), params, false)
            const json = JSON.parse(raw) as { success: boolean; path: string; error: string }
            if (!json.success) return { success: false, error: json.error }

            const buf = fs.readFileSync(json.path)
            const base64 = 'data:image/png;base64,' + buf.toString('base64')
            return { success: true, base64, tempPath: json.path }
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) }
          } finally {
            activeTaskLabel = null
            onActivityChange?.()
          }
        }
      )

      ipcMain.handle(
        SCANNER_IPC.saveImage,
        async (_e, { base64, destPath }: SaveImagePayload): Promise<FileOperationResult> => {
          try {
            const data = base64.replace(/^data:image\/\w+;base64,/, '')
            fs.writeFileSync(destPath, Buffer.from(data, 'base64'))
            return { success: true, path: destPath }
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) }
          }
        }
      )

      ipcMain.handle(
        SCANNER_IPC.savePdf,
        async (_e, { imagePaths, destPath, pageSize }: SavePdfPayload): Promise<FileOperationResult> => {
          activeTaskLabel = 'Generando documento PDF…'
          onActivityChange?.()
          try {
            // Carga diferida (Lazy) de PDFKit solo al exportar un PDF
            const pdfkitMod = await import('pdfkit')
            const PDFDocument = pdfkitMod.default ?? pdfkitMod

            return await new Promise<FileOperationResult>((resolve) => {
              try {
                const doc = new PDFDocument({ autoFirstPage: false, margin: 0 })
                const ws = fs.createWriteStream(destPath)
                doc.pipe(ws)

                const size: [number, number] =
                  pageSize === 'letter' ? [612, 792] : [595.28, 841.89]
                for (const imgPath of imagePaths) {
                  if (!fs.existsSync(imgPath)) continue
                  doc.addPage({ size, margin: 0 })
                  doc.image(imgPath, 0, 0, {
                    fit: [size[0], size[1]],
                    align: 'center',
                    valign: 'center'
                  })
                }

                doc.end()
                ws.on('finish', () => resolve({ success: true, path: destPath }))
                ws.on('error', (err) => resolve({ success: false, error: err.message }))
              } catch (err) {
                resolve({
                  success: false,
                  error: err instanceof Error ? err.message : String(err)
                })
              }
            })
          } finally {
            activeTaskLabel = null
            onActivityChange?.()
          }
        }
      )

      ipcMain.handle(SCANNER_IPC.dialogOpenFolder, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const opts: Electron.OpenDialogOptions = {
          properties: ['openDirectory'],
          title: 'Seleccionar carpeta de destino'
        }
        return win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts)
      })

      ipcMain.handle(SCANNER_IPC.getDocsPath, () => {
        const d = path.join(app.getPath('documents'), 'EscanerAlbedo')
        ensureDir(d)
        return d
      })

      ipcMain.handle(SCANNER_IPC.openPath, async (_e, p: string) => shell.openPath(p))

      ipcMain.handle(
        SCANNER_IPC.readBase64,
        async (_e, filePath: string): Promise<FileOperationResult> => {
          try {
            const buf = fs.readFileSync(filePath)
            const ext = path.extname(filePath).toLowerCase().replace('.', '')
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
            return { success: true, base64: `data:${mime};base64,${buf.toString('base64')}` }
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) }
          }
        }
      )
    },

    async unregisterIpc() {
      if (!registered) return
      registered = false
      processTracker.killAll()
      activeTaskLabel = null
      Object.values(SCANNER_IPC).forEach((channel) => {
        ipcMain.removeHandler(channel)
      })
    },

    async killActiveProcesses() {
      processTracker.killAll()
      activeTaskLabel = null
      onActivityChange?.()
    },

    async checkDependencies(): Promise<DependencyStatus[]> {
      const scriptsDir = resolveScriptsDir()
      const smartScript = path.join(scriptsDir, 'scan-with-select.ps1')
      const listScript = path.join(scriptsDir, 'list-scanners.ps1')
      const scriptsExist = fs.existsSync(smartScript) && fs.existsSync(listScript)

      return [
        {
          name: 'Windows WIA / PowerShell STA Bridge',
          description: 'Subproceso efímero bajo demanda para comunicación con drivers de escáner USB y WiFi/WSD',
          ready: process.platform === 'win32' && scriptsExist,
          binaryPath: smartScript
        },
        {
          name: 'Motor PDFKit Multipágina',
          description: 'Generador de documentos PDF A4 / Carta con carga diferida',
          ready: true
        }
      ]
    },

    isRunning() {
      return activeTaskLabel !== null || processTracker.activeCount > 0
    },

    getStatusText() {
      return activeTaskLabel ?? 'Listo (0 MB en reposo)'
    }
  }
}

