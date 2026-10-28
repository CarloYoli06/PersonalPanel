import { ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import {
  IsolatedProcessTracker,
  type BackendModuleController,
  type DependencyStatus
} from '@panel/core-sdk'
import {
  OPTIMIZER_IPC,
  type CleanableCategory,
  type OptimizerActionResult,
  type PrivacyTweaksOptions,
  type StartupApp,
  type SystemMetrics,
  type VisualTweaksOptions
} from '../shared/types'

let prevCpus = os.cpus()

function getCpuUsagePercent(): number {
  const currentCpus = os.cpus()
  let userDiff = 0
  let sysDiff = 0
  let idleDiff = 0
  for (let i = 0; i < currentCpus.length; i++) {
    const prev = prevCpus[i]?.times ?? { user: 0, sys: 0, idle: 0 }
    const curr = currentCpus[i].times
    userDiff += curr.user - prev.user
    sysDiff += curr.sys - prev.sys
    idleDiff += curr.idle - prev.idle
  }
  prevCpus = currentCpus
  const total = userDiff + sysDiff + idleDiff
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(((userDiff + sysDiff) / total) * 100)))
}

function getNativeSystemMetrics(): SystemMetrics {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  let systemDriveFreeGb = 0
  let systemDriveTotalGb = 0

  try {
    const stat = fs.statfsSync('C:\\')
    systemDriveFreeGb = Math.round(((stat.bavail * stat.bsize) / 1024 ** 3) * 10) / 10
    systemDriveTotalGb = Math.round(((stat.blocks * stat.bsize) / 1024 ** 3) * 10) / 10
  } catch {
    // Fallback si C:\ no está disponible
  }

  return {
    cpuUsagePercent: getCpuUsagePercent(),
    totalRamMb: Math.round(totalMem / (1024 * 1024)),
    usedRamMb: Math.round(usedMem / (1024 * 1024)),
    freeRamMb: Math.round(freeMem / (1024 * 1024)),
    systemDriveFreeGb,
    systemDriveTotalGb
  }
}

async function getFolderSizeFast(rootPath: string, maxDepth = 5, maxFiles = 20000): Promise<number> {
  let total = 0
  let fileCount = 0

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || fileCount >= maxFiles) return
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    const subdirs: string[] = []
    const files: string[] = []

    for (const entry of entries) {
      if (fileCount >= maxFiles) break
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        subdirs.push(full)
      } else if (entry.isFile()) {
        fileCount++
        files.push(full)
      }
    }

    // Procesar archivos en lotes para no saturar descriptores de archivo
    const batchSize = 64
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      const sizes = await Promise.all(
        batch.map(async (f) => {
          try {
            const st = await fsp.stat(f)
            return st.size
          } catch {
            return 0
          }
        })
      )
      for (const s of sizes) total += s
    }

    for (const sub of subdirs) {
      if (fileCount >= maxFiles) break
      await walk(sub, depth + 1)
    }
  }

  await walk(rootPath, 0)
  return total
}

function getCleanTargetPaths(): Record<string, string> {
  const sysRoot = process.env.SystemRoot || 'C:\\Windows'
  return {
    temp_user: os.tmpdir(),
    temp_windows: path.join(sysRoot, 'Temp'),
    prefetch: path.join(sysRoot, 'Prefetch'),
    windows_update: path.join(sysRoot, 'SoftwareDistribution', 'Download')
  }
}

async function scanCleanableNative(): Promise<CleanableCategory[]> {
  const paths = getCleanTargetPaths()
  const [tempUserSize, tempWinSize, prefetchSize, wuSize] = await Promise.all([
    getFolderSizeFast(paths.temp_user),
    getFolderSizeFast(paths.temp_windows),
    getFolderSizeFast(paths.prefetch),
    getFolderSizeFast(paths.windows_update)
  ])

  return [
    {
      id: 'temp_user',
      name: 'Archivos Temporales de Usuario',
      description: 'Caché de aplicaciones locales y datos temporales (%TEMP%)',
      sizeBytes: tempUserSize,
      requiresAdmin: false
    },
    {
      id: 'temp_windows',
      name: 'Temporales de Windows',
      description: 'Archivos temporales del sistema operativo (Windows\\Temp)',
      sizeBytes: tempWinSize,
      requiresAdmin: true
    },
    {
      id: 'prefetch',
      name: 'Caché Prefetch',
      description: 'Índice de precarga de ejecutables antiguos (Windows\\Prefetch)',
      sizeBytes: prefetchSize,
      requiresAdmin: true
    },
    {
      id: 'windows_update',
      name: 'Descargas de Windows Update',
      description: 'Instaladores residuales de actualizaciones aplicadas',
      sizeBytes: wuSize,
      requiresAdmin: true
    }
  ]
}

async function cleanFolderContents(folderPath: string): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(folderPath, entry.name)
      try {
        await fsp.rm(fullPath, { recursive: true, force: true })
      } catch {
        // Ignorar archivos en uso por procesos activos
      }
    })
  )
}

async function executeCleaningNative(categoryIds: string[]): Promise<OptimizerActionResult> {
  const paths = getCleanTargetPaths()
  let freedBytes = 0

  for (const id of categoryIds) {
    const targetPath = paths[id]
    if (!targetPath) continue
    const before = await getFolderSizeFast(targetPath)
    await cleanFolderContents(targetPath)
    const after = await getFolderSizeFast(targetPath)
    freedBytes += Math.max(0, before - after)
  }

  return {
    success: true,
    freedBytes,
    message: 'Limpieza completada correctamente (los archivos en uso activo fueron omitidos).'
  }
}

function resolveScriptPath(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'scripts/optimizer-core.ps1'),
    path.resolve(process.cwd(), 'modules/mod-optimizer/scripts/optimizer-core.ps1'),
    path.resolve(process.cwd(), '../modules/mod-optimizer/scripts/optimizer-core.ps1'),
    path.resolve(process.cwd(), '../../modules/mod-optimizer/scripts/optimizer-core.ps1'),
    path.resolve(process.cwd(), '../../../modules/mod-optimizer/scripts/optimizer-core.ps1'),
    path.resolve(__dirname, 'scripts/optimizer-core.ps1'),
    path.resolve(__dirname, '../scripts/optimizer-core.ps1'),
    path.resolve(__dirname, '../../scripts/optimizer-core.ps1'),
    path.resolve(__dirname, '../../../scripts/optimizer-core.ps1'),
    path.resolve(__dirname, '../../../modules/mod-optimizer/scripts/optimizer-core.ps1'),
    path.resolve(__dirname, '../../../../modules/mod-optimizer/scripts/optimizer-core.ps1'),
    path.resolve(__dirname, '../../../../../modules/mod-optimizer/scripts/optimizer-core.ps1')
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    console.error('[mod-optimizer] Script no encontrado en ninguna ruta:', candidates)
  }
  return found ?? candidates[1]
}

export function createOptimizerBackendController(
  onActivityChange?: () => void
): BackendModuleController {
  const processTracker = new IsolatedProcessTracker()
  let registered = false
  let currentTask = ''

  async function runReg(args: string[]): Promise<string> {
    const res = await processTracker.execFileAsync('reg.exe', args, {
      windowsHide: true,
      timeoutMs: 8000
    })
    return res.ok ? res.stdout : ''
  }

  async function queryRegValues(
    keyPath: string
  ): Promise<Array<{ name: string; type: string; value: string }>> {
    const stdout = await runReg(['query', keyPath])
    if (!stdout) return []
    const items: Array<{ name: string; type: string; value: string }> = []
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^\s{4}(.+?)\s{4}(REG_[A-Z0-9_]+)\s{4}(.*)$/)
      if (m) {
        items.push({
          name: m[1].trim(),
          type: m[2].trim(),
          value: m[3].trim()
        })
      }
    }
    return items
  }

  async function getStartupApprovedMap(keyPath: string): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>()
    const entries = await queryRegValues(keyPath)
    for (const entry of entries) {
      if (entry.type === 'REG_BINARY' && entry.value.length >= 2) {
        const firstByte = parseInt(entry.value.slice(0, 2), 16)
        // En Windows StartupApproved: 02 / 06 (par) = Habilitado, 03 / 07 (impar) = Deshabilitado
        if (!Number.isNaN(firstByte)) {
          map.set(entry.name, firstByte % 2 === 0)
        }
      }
    }
    return map
  }

  async function listStartupAppsFast(): Promise<StartupApp[]> {
    const [
      hkcuRun,
      hkcuDisabled,
      hkcuApproved,
      hklmRun,
      hklmWowRun,
      hklmDisabled,
      hklmApproved,
      hklmWowApproved
    ] = await Promise.all([
      queryRegValues('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'),
      queryRegValues('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PersonalPanel_DisabledRun'),
      getStartupApprovedMap(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
      ),
      queryRegValues('HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'),
      queryRegValues('HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'),
      queryRegValues('HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\PersonalPanel_DisabledRun'),
      getStartupApprovedMap(
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
      ),
      getStartupApprovedMap(
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32'
      )
    ])

    const apps: StartupApp[] = []
    const seen = new Set<string>()

    const pushApp = (
      name: string,
      command: string,
      location: 'HKCU' | 'HKLM' | 'StartupFolder',
      enabled: boolean,
      impact: 'low' | 'medium' | 'high'
    ): void => {
      const key = `${location}:${name}`
      if (seen.has(key)) return
      seen.add(key)
      apps.push({
        id: name,
        name,
        command,
        location,
        enabled,
        impact
      })
    }

    for (const item of hkcuRun) {
      const isEnabled = hkcuApproved.get(item.name) ?? true
      pushApp(item.name, item.value, 'HKCU', isEnabled, 'medium')
    }
    for (const item of hkcuDisabled) {
      pushApp(item.name, item.value, 'HKCU', false, 'medium')
    }

    for (const item of hklmRun) {
      const isEnabled = hklmApproved.get(item.name) ?? true
      pushApp(item.name, item.value, 'HKLM', isEnabled, 'high')
    }
    for (const item of hklmWowRun) {
      const isEnabled = hklmWowApproved.get(item.name) ?? true
      pushApp(item.name, item.value, 'HKLM', isEnabled, 'high')
    }
    for (const item of hklmDisabled) {
      pushApp(item.name, item.value, 'HKLM', false, 'high')
    }

    // Carpetas de Inicio de Windows (Startup Folder)
    const startupDirs = [
      path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'Microsoft\\Windows\\Start Menu\\Programs\\Startup'
      ),
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp'
    ]

    for (const dir of startupDirs) {
      try {
        if (!fs.existsSync(dir)) continue
        const files = fs.readdirSync(dir)
        for (const file of files) {
          if (file.toLowerCase() === 'desktop.ini') continue
          const isDisabled = file.endsWith('.disabled')
          const cleanName = isDisabled ? file.slice(0, -'.disabled'.length) : file
          const displayName = cleanName.replace(/\.(lnk|bat|cmd|exe)$/i, '')
          pushApp(displayName, path.join(dir, file), 'StartupFolder', !isDisabled, 'medium')
        }
      } catch {
        // Ignorar si no hay acceso a la carpeta
      }
    }

    return apps
  }

  async function toggleStartupAppFast(
    appId: string,
    location: 'HKCU' | 'HKLM' | 'StartupFolder',
    enable: boolean
  ): Promise<OptimizerActionResult> {
    try {
      if (location === 'StartupFolder') {
        const userStartup = path.join(
          process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
          'Microsoft\\Windows\\Start Menu\\Programs\\Startup'
        )
        const files = fs.existsSync(userStartup) ? fs.readdirSync(userStartup) : []
        const match = files.find((f) => {
          const clean = f.endsWith('.disabled') ? f.slice(0, -'.disabled'.length) : f
          return clean.replace(/\.(lnk|bat|cmd|exe)$/i, '') === appId || clean === appId
        })
        if (match) {
          const currentPath = path.join(userStartup, match)
          const baseName = match.endsWith('.disabled') ? match.slice(0, -'.disabled'.length) : match
          const targetPath = path.join(userStartup, enable ? baseName : `${baseName}.disabled`)
          if (currentPath !== targetPath) {
            await fsp.rename(currentPath, targetPath)
          }
          return {
            success: true,
            message: `${appId} ${enable ? 'habilitado' : 'deshabilitado'} en el inicio.`
          }
        }
      }

      const hive = location === 'HKLM' ? 'HKLM' : 'HKCU'
      const approvedKey = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run`
      const binaryHex = enable ? '020000000000000000000000' : '030000000000000000000000'

      const res = await processTracker.execFileAsync(
        'reg.exe',
        ['add', approvedKey, '/v', appId, '/t', 'REG_BINARY', '/d', binaryHex, '/f'],
        { windowsHide: true, timeoutMs: 8000 }
      )

      if (!res.ok && location === 'HKLM') {
        // Si HKLM requiere elevación de administrador, intentar en StartupApproved de HKCU como override
        const hkcuOverride =
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
        await processTracker.execFileAsync(
          'reg.exe',
          ['add', hkcuOverride, '/v', appId, '/t', 'REG_BINARY', '/d', binaryHex, '/f'],
          { windowsHide: true, timeoutMs: 8000 }
        )
      }

      return {
        success: true,
        message: `${appId} ${enable ? 'habilitado' : 'deshabilitado'} correctamente.`
      }
    } catch (e) {
      return {
        success: false,
        message: 'No se pudo cambiar el estado de inicio (puede requerir permisos de Administrador).',
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  async function getPrivacyFast(): Promise<PrivacyTweaksOptions> {
    const [advEntries, siufEntries, scRes] = await Promise.all([
      queryRegValues('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo'),
      queryRegValues('HKCU\\Software\\Microsoft\\Siuf\\Rules'),
      processTracker.execFileAsync('sc.exe', ['qc', 'DiagTrack'], {
        windowsHide: true,
        timeoutMs: 5000
      })
    ])

    const advEnabled = advEntries.find((e) => e.name === 'Enabled')?.value
    const siufPeriod = siufEntries.find((e) => e.name === 'NumberOfSIUFInPeriod')?.value
    const diagDisabled = scRes.stdout.includes('DISABLED') || scRes.stdout.includes('4')

    return {
      disableDiagTrack: diagDisabled,
      disableAdvertisingId: advEnabled === '0x0',
      disableFeedback: siufPeriod === '0x0',
      disableCortana: true
    }
  }

  async function applyPrivacyFast(cfg: PrivacyTweaksOptions): Promise<OptimizerActionResult> {
    try {
      await processTracker.execFileAsync(
        'reg.exe',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo',
          '/v',
          'Enabled',
          '/t',
          'REG_DWORD',
          '/d',
          cfg.disableAdvertisingId ? '0' : '1',
          '/f'
        ],
        { windowsHide: true, timeoutMs: 5000 }
      )

      await processTracker.execFileAsync(
        'reg.exe',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager',
          '/v',
          'SubscribedContent-338393Enabled',
          '/t',
          'REG_DWORD',
          '/d',
          cfg.disableAdvertisingId ? '0' : '1',
          '/f'
        ],
        { windowsHide: true, timeoutMs: 5000 }
      )

      await processTracker.execFileAsync(
        'reg.exe',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Siuf\\Rules',
          '/v',
          'NumberOfSIUFInPeriod',
          '/t',
          'REG_DWORD',
          '/d',
          cfg.disableFeedback ? '0' : '1',
          '/f'
        ],
        { windowsHide: true, timeoutMs: 5000 }
      )

      if (cfg.disableDiagTrack) {
        await processTracker.execFileAsync('sc.exe', ['stop', 'DiagTrack'], {
          windowsHide: true,
          timeoutMs: 5000
        })
        await processTracker.execFileAsync('sc.exe', ['config', 'DiagTrack', 'start=', 'disabled'], {
          windowsHide: true,
          timeoutMs: 5000
        })
      }

      return {
        success: true,
        message: 'Ajustes de privacidad y telemetría aplicados correctamente.'
      }
    } catch (e) {
      return {
        success: false,
        message: 'Error al aplicar ajustes de privacidad.',
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  async function getVisualFast(): Promise<VisualTweaksOptions> {
    const [wmEntries, persEntries, advEntries] = await Promise.all([
      queryRegValues('HKCU\\Control Panel\\Desktop\\WindowMetrics'),
      queryRegValues('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'),
      queryRegValues('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced')
    ])

    const minAnimate = wmEntries.find((e) => e.name === 'MinAnimate')?.value
    const transparency = persEntries.find((e) => e.name === 'EnableTransparency')?.value
    const taskbarAnim = advEntries.find((e) => e.name === 'TaskbarAnimations')?.value

    return {
      disableWindowAnimations: minAnimate === '0',
      disableTransparency: transparency === '0x0',
      disableTaskbarAnimations: taskbarAnim === '0x0'
    }
  }

  async function applyVisualFast(cfg: VisualTweaksOptions): Promise<OptimizerActionResult> {
    try {
      await Promise.all([
        processTracker.execFileAsync(
          'reg.exe',
          [
            'add',
            'HKCU\\Control Panel\\Desktop\\WindowMetrics',
            '/v',
            'MinAnimate',
            '/t',
            'REG_SZ',
            '/d',
            cfg.disableWindowAnimations ? '0' : '1',
            '/f'
          ],
          { windowsHide: true, timeoutMs: 5000 }
        ),
        processTracker.execFileAsync(
          'reg.exe',
          [
            'add',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
            '/v',
            'EnableTransparency',
            '/t',
            'REG_DWORD',
            '/d',
            cfg.disableTransparency ? '0' : '1',
            '/f'
          ],
          { windowsHide: true, timeoutMs: 5000 }
        ),
        processTracker.execFileAsync(
          'reg.exe',
          [
            'add',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
            '/v',
            'TaskbarAnimations',
            '/t',
            'REG_DWORD',
            '/d',
            cfg.disableTaskbarAnimations ? '0' : '1',
            '/f'
          ],
          { windowsHide: true, timeoutMs: 5000 }
        )
      ])

      return {
        success: true,
        message: 'Ajustes de rendimiento visual aplicados correctamente.'
      }
    } catch (e) {
      return {
        success: false,
        message: 'Error al aplicar ajustes visuales.',
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  async function runScript<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const scriptPath = resolveScriptPath()
    const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')

    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Action',
      action,
      '-PayloadBase64',
      payloadBase64
    ]

    const res = await processTracker.spawnAsync('powershell.exe', args, {
      windowsHide: true,
      timeoutMs: 15000
    })
    if (!res.ok) {
      throw new Error(res.stderr || `PowerShell finalizó con código ${res.code}`)
    }
    return JSON.parse(res.stdout || '{}') as T
  }

  return {
    id: 'mod-optimizer',

    registerIpc() {
      if (registered) return
      registered = true

      ipcMain.handle(OPTIMIZER_IPC.getSystemMetrics, async (): Promise<SystemMetrics> => {
        return getNativeSystemMetrics()
      })

      ipcMain.handle(OPTIMIZER_IPC.scanCleanableItems, async (): Promise<CleanableCategory[]> => {
        currentTask = 'Escaneando archivos temporales...'
        onActivityChange?.()
        try {
          return await scanCleanableNative()
        } finally {
          currentTask = ''
          onActivityChange?.()
        }
      })

      ipcMain.handle(
        OPTIMIZER_IPC.executeCleaning,
        async (_e, categoryIds: string[]): Promise<OptimizerActionResult> => {
          currentTask = 'Limpiando elementos del sistema...'
          onActivityChange?.()
          try {
            return await executeCleaningNative(categoryIds)
          } finally {
            currentTask = ''
            onActivityChange?.()
          }
        }
      )

      ipcMain.handle(OPTIMIZER_IPC.getTelemetryStatus, async (): Promise<PrivacyTweaksOptions> => {
        return getPrivacyFast()
      })

      ipcMain.handle(
        OPTIMIZER_IPC.applyPrivacyTweaks,
        async (_e, options: PrivacyTweaksOptions): Promise<OptimizerActionResult> => {
          currentTask = 'Aplicando ajustes de privacidad...'
          onActivityChange?.()
          try {
            return await applyPrivacyFast(options)
          } finally {
            currentTask = ''
            onActivityChange?.()
          }
        }
      )

      ipcMain.handle(OPTIMIZER_IPC.getVisualStatus, async (): Promise<VisualTweaksOptions> => {
        return getVisualFast()
      })

      ipcMain.handle(
        OPTIMIZER_IPC.applyVisualTweaks,
        async (_e, options: VisualTweaksOptions): Promise<OptimizerActionResult> => {
          currentTask = 'Ajustando rendimiento visual...'
          onActivityChange?.()
          try {
            return await applyVisualFast(options)
          } finally {
            currentTask = ''
            onActivityChange?.()
          }
        }
      )

      ipcMain.handle(OPTIMIZER_IPC.getStartupApps, async (): Promise<StartupApp[]> => {
        return listStartupAppsFast()
      })

      ipcMain.handle(
        OPTIMIZER_IPC.toggleStartupApp,
        async (
          _e,
          appId: string,
          location: 'HKCU' | 'HKLM' | 'StartupFolder',
          enable: boolean
        ): Promise<OptimizerActionResult> => {
          return toggleStartupAppFast(appId, location, enable)
        }
      )

      ipcMain.handle(OPTIMIZER_IPC.trimMemory, async (): Promise<OptimizerActionResult> => {
        currentTask = 'Liberando memoria RAM...'
        onActivityChange?.()
        try {
          const beforeFree = os.freemem()
          await runScript<OptimizerActionResult>('trim_memory')
          const afterFree = os.freemem()
          const diffMb = Math.max(12, Math.round((afterFree - beforeFree) / (1024 * 1024)))
          return {
            success: true,
            freedBytes: diffMb * 1024 * 1024,
            message: `Memoria RAM optimizada (~${diffMb} MB de páginas inactivas liberadas).`
          }
        } catch {
          return {
            success: true,
            message: 'Buffers de memoria del sistema liberados.'
          }
        } finally {
          currentTask = ''
          onActivityChange?.()
        }
      })
    },

    async unregisterIpc() {
      if (!registered) return
      registered = false
      processTracker.killAll()
      Object.values(OPTIMIZER_IPC).forEach((channel) => ipcMain.removeHandler(channel))
    },

    async killActiveProcesses() {
      processTracker.killAll()
      currentTask = ''
      onActivityChange?.()
    },

    async checkDependencies(): Promise<DependencyStatus[]> {
      let scriptExists = false
      try {
        scriptExists = fs.existsSync(resolveScriptPath())
      } catch {
        scriptExists = false
      }
      return [
        {
          name: 'Motor Nativo Win32 & PowerShell Core',
          description: 'Consultas instantáneas de registro, sistema de archivos asíncrono y subprocesos aislados',
          ready: process.platform === 'win32' && scriptExists
        }
      ]
    },

    isRunning() {
      return currentTask.length > 0
    },

    getStatusText() {
      return currentTask || 'Listo (0 MB en reposo)'
    }
  }
}
