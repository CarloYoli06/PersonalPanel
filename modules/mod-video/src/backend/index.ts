import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, shell } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { FfmpegCommand, FfprobeData } from 'fluent-ffmpeg'
import {
  IsolatedProcessTracker,
  type BackendModuleController,
  type DependencyStatus
} from '@panel/core-sdk'
import {
  VIDEO_IPC,
  LEVEL_QUALITY,
  VIDEO_EXTENSIONS,
  type CompressRequest,
  type CompressResult,
  type CompressionSettings,
  type ProbeResult,
  type ProgressPayload,
  type SystemInfo,
  type VideoInfo
} from '../shared/types'

const toUnpacked = (p: string): string => p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')

interface FfmpegBundle {
  ffmpeg: typeof import('fluent-ffmpeg')
  ffmpegPath: string
  ffprobePath: string
}

let cachedBundle: FfmpegBundle | null = null

/**
 * Resuelve y configura los binarios de FFmpeg / FFprobe de forma diferida (Lazy)
 * solo cuando el usuario interactúa con `mod-video`.
 * Soporta además verificación futura en `AppData/binaries/ffmpeg`.
 */
async function loadFfmpegLazy(): Promise<FfmpegBundle> {
  if (cachedBundle) return cachedBundle

  const ffmpegMod = await import('fluent-ffmpeg')
  const ffmpeg = (ffmpegMod.default ?? ffmpegMod) as typeof import('fluent-ffmpeg')

  let ffmpegStaticPath = ''
  let installerPath = ''
  let ffprobeInstallerPath = ''

  try {
    const mod = await import('ffmpeg-static')
    ffmpegStaticPath = (mod.default ?? mod) as unknown as string
  } catch {
    /* ignore */
  }

  try {
    const mod = await import('@ffmpeg-installer/ffmpeg')
    installerPath = (mod.default ?? mod).path
  } catch {
    /* ignore */
  }

  try {
    const mod = await import('@ffprobe-installer/ffprobe')
    ffprobeInstallerPath = (mod.default ?? mod).path
  } catch {
    /* ignore */
  }

  const appDataBinDir = path.join(app.getPath('userData'), 'binaries', 'ffmpeg')
  const appDataFfmpeg = path.join(appDataBinDir, 'ffmpeg.exe')
  const appDataFfprobe = path.join(appDataBinDir, 'ffprobe.exe')
  const resUnpacked = path.join(process.resourcesPath ?? '', 'app.asar.unpacked', 'node_modules')

  const ffmpegCandidates = [
    appDataFfmpeg,
    path.join(resUnpacked, 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(resUnpacked, '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
    path.resolve(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg.exe'),
    path.resolve(process.cwd(), '../../node_modules/ffmpeg-static/ffmpeg.exe'),
    path.resolve(process.cwd(), 'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),
    path.resolve(process.cwd(), '../../node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),
    path.resolve(__dirname, '../../../node_modules/ffmpeg-static/ffmpeg.exe'),
    path.resolve(__dirname, '../../../../node_modules/ffmpeg-static/ffmpeg.exe'),
    path.resolve(__dirname, '../../../node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),
    path.resolve(__dirname, '../../../../node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),
    ffmpegStaticPath,
    installerPath
  ]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map(toUnpacked)

  const ffprobeCandidates = [
    appDataFfprobe,
    path.join(resUnpacked, '@ffprobe-installer', 'win32-x64', 'ffprobe.exe'),
    path.resolve(process.cwd(), 'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
    path.resolve(process.cwd(), '../../node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
    path.resolve(__dirname, '../../../node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
    path.resolve(__dirname, '../../../../node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
    ffprobeInstallerPath
  ]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map(toUnpacked)

  const ffmpegPath = ffmpegCandidates.find((p) => fs.existsSync(p)) ?? ffmpegCandidates[0]
  const ffprobePath = ffprobeCandidates.find((p) => fs.existsSync(p)) ?? ffprobeCandidates[0]

  ffmpeg.setFfmpegPath(ffmpegPath)
  ffmpeg.setFfprobePath(ffprobePath)

  cachedBundle = { ffmpeg, ffmpegPath, ffprobePath }
  return cachedBundle
}

const SCALE_TO_1080P =
  "scale=w='if(gte(iw,ih),-2,min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),-2)':flags=lanczos"

const NVENC_ERROR_PATTERN =
  /Cannot load nvcuda|No NVENC capable devices|No capable devices found|OpenEncodeSessionEx failed|Driver does not support the required nvenc API|InitializeEncoder failed|nvenc.*out of memory/i

function timemarkToSeconds(timemark: string | undefined): number {
  if (!timemark || timemark.startsWith('-')) return 0
  const parts = timemark.split(':').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

function resolveOutputPath(inputPath: string, settings: CompressionSettings): string {
  const { dir, name } = path.parse(inputPath)
  const targetDir = settings.outputMode === 'custom' && settings.outputDir ? settings.outputDir : dir
  fs.mkdirSync(targetDir, { recursive: true })

  let candidate = path.join(targetDir, `${name}_compressed.mp4`)
  for (let i = 1; fs.existsSync(candidate); i++) {
    candidate = path.join(targetDir, `${name}_compressed (${i}).mp4`)
  }
  return candidate
}

function buildOutputOptions(settings: CompressionSettings, info: VideoInfo, system: SystemInfo): string[] {
  const quality = String(LEVEL_QUALITY[settings.engine][settings.level])

  const videoCodec =
    settings.engine === 'nvenc'
      ? [
          '-c:v',
          'h264_nvenc',
          '-rc',
          'vbr',
          '-cq',
          quality,
          '-b:v',
          '0',
          '-preset',
          system.nvencModernPresets ? 'p4' : 'medium',
          '-profile:v',
          'high'
        ]
      : ['-c:v', 'libx264', '-crf', quality, '-preset', 'fast', '-profile:v', 'high']

  const needsScale = settings.limitTo1080p && Math.min(info.width, info.height) > 1080
  const filters = needsScale ? ['-vf', SCALE_TO_1080P] : []

  return [
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    ...videoCodec,
    ...filters,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-max_muxing_queue_size',
    '1024'
  ]
}

function friendlyError(err: Error, stderr: string, settings: CompressionSettings): string {
  if (settings.engine === 'nvenc' && NVENC_ERROR_PATTERN.test(stderr)) {
    return 'NVENC no está disponible (GPU/driver NVIDIA no compatible u ocupada). Prueba con el motor CPU (x264).'
  }
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('frame=') && !l.startsWith('size='))
  return lines.slice(-2).join(' · ') || err.message
}

function safeUnlink(filePath: string, attempts = 6): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    if (attempts > 0) setTimeout(() => safeUnlink(filePath, attempts - 1), 300)
  }
}

interface ActiveJob {
  jobId: string
  command: FfmpegCommand
  outputPath: string
  cancelled: boolean
  percent: number
}

export function createVideoBackendController(
  onActivityChange?: () => void
): BackendModuleController {
  const processTracker = new IsolatedProcessTracker()
  let activeJob: ActiveJob | null = null
  let systemInfoPromise: Promise<SystemInfo> | null = null
  let registered = false

  async function getSystemInfo(): Promise<SystemInfo> {
    if (!systemInfoPromise) {
      systemInfoPromise = (async () => {
        const { ffmpegPath } = await loadFfmpegLazy()
        const [version, encoderHelp, nvencTest] = await Promise.all([
          processTracker.execFileAsync(ffmpegPath, ['-hide_banner', '-version']),
          processTracker.execFileAsync(ffmpegPath, ['-hide_banner', '-h', 'encoder=h264_nvenc']),
          processTracker.execFileAsync(ffmpegPath, [
            '-hide_banner',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            'color=c=black:s=640x360:d=0.2',
            '-c:v',
            'h264_nvenc',
            '-f',
            'null',
            '-'
          ])
        ])

        const versionMatch = /ffmpeg version (\S+)/.exec(version.stdout)
        return {
          ffmpegPath,
          ffmpegVersion: versionMatch?.[1] ?? 'desconocida',
          nvencAvailable: nvencTest.ok,
          nvencModernPresets: /\bp4\b/.test(encoderHelp.stdout + encoderHelp.stderr)
        }
      })()
    }
    return systemInfoPromise
  }

  async function probeVideo(filePath: string): Promise<VideoInfo> {
    const { ffmpeg } = await loadFfmpegLazy()
    const { size } = fs.statSync(filePath)
    const data = await new Promise<FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, d) => (err ? reject(err) : resolve(d)))
    })
    const video = data.streams.find((s) => s.codec_type === 'video')
    if (!video) throw new Error('El archivo no contiene una pista de video.')

    const duration = Number(data.format.duration ?? video.duration ?? 0)
    return {
      path: filePath,
      name: path.basename(filePath),
      size,
      duration: Number.isFinite(duration) ? duration : 0,
      width: video.width ?? 0,
      height: video.height ?? 0,
      codec: video.codec_name ?? 'desconocido'
    }
  }

  function sendProgress(sender: WebContents, payload: ProgressPayload): void {
    if (!sender.isDestroyed()) sender.send(VIDEO_IPC.progress, payload)
  }

  function cancelActiveJob(): boolean {
    if (!activeJob) return false
    const { outputPath, command } = activeJob
    activeJob.cancelled = true
    try {
      command.kill('SIGKILL')
    } catch {
      /* ignore */
    }
    safeUnlink(outputPath)
    return true
  }

  async function compressVideo(
    event: IpcMainInvokeEvent,
    request: CompressRequest
  ): Promise<CompressResult> {
    if (activeJob) return { ok: false, cancelled: false, error: 'Ya hay una compresión en curso.' }

    const { jobId, inputPath, settings } = request
    const sender = event.sender
    const win = BrowserWindow.fromWebContents(sender)
    const blockerId = powerSaveBlocker.start('prevent-app-suspension')

    try {
      if (!fs.existsSync(inputPath)) throw new Error('El archivo original ya no existe.')

      const [{ ffmpeg }, info, system] = await Promise.all([
        loadFfmpegLazy(),
        probeVideo(inputPath),
        getSystemInfo()
      ])
      const outputPath = resolveOutputPath(inputPath, settings)
      const outputOptions = buildOutputOptions(settings, info, system)
      const startedAt = Date.now()

      return await new Promise<CompressResult>((resolve) => {
        const command = ffmpeg(inputPath).outputOptions(outputOptions).output(outputPath)
        const job: ActiveJob = { jobId, command, outputPath, cancelled: false, percent: 0 }
        activeJob = job
        onActivityChange?.()

        command
          .on('start', (cmdLine: string) => console.log(`[mod-video:ffmpeg] ${cmdLine}`))
          .on('progress', (p: { timemark?: string; currentFps?: number; percent?: number }) => {
            const seconds = timemarkToSeconds(p.timemark)
            const raw = info.duration > 0 ? (seconds / info.duration) * 100 : (p.percent ?? 0)
            const percent = Math.max(0, Math.min(99.9, raw))
            const elapsed = (Date.now() - startedAt) / 1000
            const etaSeconds = percent > 0.5 ? (elapsed * (100 - percent)) / percent : null

            job.percent = percent
            sendProgress(sender, { jobId, percent, fps: p.currentFps ?? null, etaSeconds })
            win?.setProgressBar(percent / 100)
            onActivityChange?.()
          })
          .on('end', () => {
            const outputSize = fs.statSync(outputPath).size
            const inputSize = fs.statSync(inputPath).size
            sendProgress(sender, { jobId, percent: 100, fps: null, etaSeconds: 0 })
            resolve({ ok: true, outputPath, inputSize, outputSize })
          })
          .on('error', (err: Error, _stdout: string | null, stderr: string | null) => {
            safeUnlink(outputPath)
            if (job.cancelled) {
              resolve({ ok: false, cancelled: true, error: 'Cancelado por el usuario.' })
            } else {
              console.error('[mod-video:ffmpeg] error:', err.message, '\n', stderr)
              resolve({ ok: false, cancelled: false, error: friendlyError(err, stderr ?? '', settings) })
            }
          })

        command.run()
      })
    } catch (err) {
      return { ok: false, cancelled: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      activeJob = null
      powerSaveBlocker.stop(blockerId)
      if (win && !win.isDestroyed()) win.setProgressBar(-1)
      onActivityChange?.()
    }
  }

  return {
    id: 'mod-video',

    registerIpc() {
      if (registered) return
      registered = true

      ipcMain.handle(VIDEO_IPC.selectFiles, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const options: Electron.OpenDialogOptions = {
          title: 'Selecciona videos para comprimir',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Videos', extensions: [...VIDEO_EXTENSIONS] }]
        }
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options)
        return result.canceled ? [] : result.filePaths
      })

      ipcMain.handle(VIDEO_IPC.selectFolder, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const options: Electron.OpenDialogOptions = {
          title: 'Carpeta de destino',
          properties: ['openDirectory', 'createDirectory']
        }
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options)
        return result.canceled ? null : (result.filePaths[0] ?? null)
      })

      ipcMain.handle(VIDEO_IPC.probe, async (_event, paths: string[]): Promise<ProbeResult[]> => {
        const results: ProbeResult[] = []
        for (const p of paths) {
          try {
            results.push({ ok: true, info: await probeVideo(p) })
          } catch (err) {
            let size = 0
            try {
              size = fs.statSync(p).size
            } catch {
              /* ignore */
            }
            results.push({
              ok: false,
              path: p,
              name: path.basename(p),
              size,
              error: err instanceof Error ? err.message.split('\n')[0] : 'No se pudo leer el video.'
            })
          }
        }
        return results
      })

      ipcMain.handle(VIDEO_IPC.compress, compressVideo)
      ipcMain.handle(VIDEO_IPC.cancel, () => cancelActiveJob())
      ipcMain.handle(VIDEO_IPC.systemInfo, () => getSystemInfo())
      ipcMain.handle(VIDEO_IPC.showItem, (_event, filePath: string) =>
        shell.showItemInFolder(filePath)
      )
    },

    async unregisterIpc() {
      if (!registered) return
      registered = false
      cancelActiveJob()
      processTracker.killAll()
      Object.values(VIDEO_IPC).forEach((channel) => {
        ipcMain.removeHandler(channel)
      })
    },

    async killActiveProcesses() {
      cancelActiveJob()
      processTracker.killAll()
      onActivityChange?.()
    },

    async checkDependencies(): Promise<DependencyStatus[]> {
      try {
        const { ffmpegPath, ffprobePath } = await loadFfmpegLazy()
        const ffmpegExists = fs.existsSync(ffmpegPath)
        const ffprobeExists = fs.existsSync(ffprobePath)
        const sys = ffmpegExists ? await getSystemInfo() : null

        return [
          {
            name: 'FFmpeg Engine (x64)',
            description: 'Motor de codificación H.264 / NVENC bajo demanda',
            ready: ffmpegExists,
            version: sys?.ffmpegVersion,
            binaryPath: ffmpegPath
          },
          {
            name: 'FFprobe Analyzer',
            description: 'Inspector de streams, resolución y duración de contenedores',
            ready: ffprobeExists,
            binaryPath: ffprobePath
          },
          {
            name: 'NVIDIA NVENC Hardware Encoder',
            description: 'Aceleración por hardware GPU (opcional, fallback automático a CPU x264)',
            ready: Boolean(sys?.nvencAvailable),
            optional: true
          }
        ]
      } catch {
        return [
          {
            name: 'FFmpeg Engine (x64)',
            description: 'Motor de codificación H.264 / NVENC bajo demanda',
            ready: false
          }
        ]
      }
    },

    isRunning() {
      return activeJob !== null || processTracker.activeCount > 0
    },

    getStatusText() {
      if (activeJob) {
        return `Comprimiendo video (${activeJob.percent.toFixed(0)}%)…`
      }
      return 'Listo (0 MB en reposo)'
    }
  }
}

