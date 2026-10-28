import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { AlertTriangle, Cpu, Zap } from 'lucide-react'
import type { ModuleViewProps } from '@panel/core-sdk'
import { GlobalToast } from '@panel/ui-kit'
import type {
  CompressionSettings,
  Job,
  ProbeResult,
  SystemInfo
} from '../shared/types'
import { createId, isVideoFile } from './lib/format'
import { getVideoApi, isElectronVideo } from './lib/videoApi'
import { DropZone } from './components/DropZone'
import { QueueList } from './components/QueueList'
import { SettingsPanel } from './components/SettingsPanel'
import { ActionPanel } from './components/ActionPanel'

const SETTINGS_KEY = 'filediet.settings.v1'

const DEFAULT_SETTINGS: CompressionSettings = {
  engine: 'nvenc',
  level: 'balanced',
  outputMode: 'same',
  outputDir: null,
  limitTo1080p: true
}

function loadSettings(): CompressionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<CompressionSettings>) }
      : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function jobFromProbe(result: ProbeResult): Job {
  const base = { id: createId(), progress: 0, fps: null, etaSeconds: null }
  if (result.ok) {
    return { ...base, ...result.info, status: 'pending' }
  }
  return {
    ...base,
    path: result.path,
    name: result.name,
    size: result.size,
    duration: 0,
    width: 0,
    height: 0,
    codec: '',
    status: 'error',
    error: `No se pudo analizar el archivo: ${result.error}`
  }
}

export default function VideoModuleView({ onStatusChange }: ModuleViewProps): JSX.Element {
  const api = useMemo(() => getVideoApi(), [])

  const [jobs, setJobsState] = useState<Job[]>([])
  const jobsRef = useRef<Job[]>([])
  const setJobs = useCallback((updater: (prev: Job[]) => Job[]) => {
    jobsRef.current = updater(jobsRef.current)
    setJobsState(jobsRef.current)
  }, [])

  const patchJob = useCallback(
    (id: string, patch: Partial<Job>) =>
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j))),
    [setJobs]
  )

  const [settings, setSettings] = useState<CompressionSettings>(loadSettings)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const updateSettings = useCallback(
    (patch: Partial<CompressionSettings>) => setSettings((s) => ({ ...s, ...patch })),
    []
  )

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    let mounted = true
    api.getSystemInfo().then((info) => {
      if (!mounted) return
      setSystem(info)
      if (!info.nvencAvailable) {
        setSettings((s) => (s.engine === 'nvenc' ? { ...s, engine: 'x264' } : s))
      }
    })
    return () => {
      mounted = false
    }
  }, [api])

  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const dragDepth = useRef(0)
  const cancelRequested = useRef(false)
  const toastTimer = useRef<number>()

  const notify = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(
    () =>
      api.onProgress(({ jobId, percent, fps, etaSeconds }) => {
        patchJob(jobId, { progress: percent, fps, etaSeconds })
        onStatusChange?.(true, `Comprimiendo (${percent.toFixed(0)}%)…`)
      }),
    [api, patchJob, onStatusChange]
  )

  const addPaths = useCallback(
    async (paths: string[]) => {
      const known = new Set(jobsRef.current.map((j) => j.path.toLowerCase()))
      const videos = [...new Set(paths)].filter(isVideoFile)
      const fresh = videos.filter((p) => !known.has(p.toLowerCase()))

      const unsupported = paths.length - videos.length
      const duplicates = videos.length - fresh.length
      if (unsupported > 0) notify(`${unsupported} archivo(s) ignorado(s): formato no soportado`)
      else if (duplicates > 0) notify(`${duplicates} archivo(s) ya estaban en la cola`)
      if (fresh.length === 0) return

      setAnalyzing(true)
      try {
        const results = await api.probeFiles(fresh)
        setJobs((prev) => [...prev, ...results.map(jobFromProbe)])
      } finally {
        setAnalyzing(false)
      }
    },
    [api, notify, setJobs]
  )

  const browseFiles = useCallback(async () => {
    const paths = await api.selectFiles()
    if (paths.length) await addPaths(paths)
  }, [api, addPaths])

  const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files')

  const onDragEnter = (e: DragEvent): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (e: DragEvent): void => {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((file) => api.getPathForFile(file))
      .filter(Boolean)
    if (paths.length) void addPaths(paths)
  }

  const pickFolder = useCallback(async (): Promise<string | null> => {
    const dir = await api.selectFolder()
    if (dir) updateSettings({ outputDir: dir, outputMode: 'custom' })
    return dir
  }, [api, updateSettings])

  const startQueue = useCallback(async () => {
    if (running) return

    let effective = settings
    if (settings.outputMode === 'custom' && !settings.outputDir) {
      const dir = await pickFolder()
      if (!dir) return notify('Elige una carpeta de destino para continuar')
      effective = { ...settings, outputDir: dir }
    }

    cancelRequested.current = false
    setRunning(true)
    onStatusChange?.(true, 'Comprimiendo cola de videos…')
    let completed = 0

    try {
      while (!cancelRequested.current) {
        const next = jobsRef.current.find((j) => j.status === 'pending')
        if (!next) break

        patchJob(next.id, {
          status: 'compressing',
          progress: 0,
          fps: null,
          etaSeconds: null,
          error: undefined
        })
        const result = await api.compress({
          jobId: next.id,
          inputPath: next.path,
          settings: effective
        })

        if (result.ok) {
          completed += 1
          patchJob(next.id, {
            status: 'done',
            progress: 100,
            size: result.inputSize,
            outputSize: result.outputSize,
            outputPath: result.outputPath,
            etaSeconds: 0
          })
        } else if (result.cancelled) {
          patchJob(next.id, { status: 'cancelled', etaSeconds: null, fps: null })
        } else {
          patchJob(next.id, { status: 'error', error: result.error, etaSeconds: null, fps: null })
        }
      }
    } finally {
      setRunning(false)
      setStopping(false)
      onStatusChange?.(false, 'Listo')
    }

    if (cancelRequested.current) {
      notify('Proceso cancelado. Los videos restantes siguen en espera.')
    } else if (completed > 0) {
      notify(`${completed} video(s) comprimido(s) correctamente.`)
    }
  }, [running, settings, pickFolder, notify, patchJob, api, onStatusChange])

  const cancelCurrent = useCallback(async () => {
    cancelRequested.current = true
    setStopping(true)
    await api.cancel()
  }, [api])

  const removeJob = useCallback(
    (id: string) =>
      setJobs((prev) => prev.filter((j) => j.id !== id || j.status === 'compressing')),
    [setJobs]
  )
  const retryJob = useCallback(
    (id: string) =>
      patchJob(id, {
        status: 'pending',
        progress: 0,
        error: undefined,
        outputPath: undefined,
        outputSize: undefined
      }),
    [patchJob]
  )
  const clearCompleted = useCallback(
    () => setJobs((prev) => prev.filter((j) => j.status !== 'done')),
    [setJobs]
  )
  const reveal = useCallback((p: string) => void api.showInFolder(p), [api])

  return (
    <div
      className="flex h-full flex-col gap-3 overflow-hidden"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Sub-header del módulo */}
      <div className="flex shrink-0 items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 backdrop-blur-xl">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            FileDiet · Optimizador de Video por Lotes
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Codificación H.264 aislada bajo demanda (FFmpeg + NVENC / x264)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isElectronVideo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-500 ring-1 ring-amber-500/30">
              <AlertTriangle className="h-3 w-3" /> Simulación Web
            </span>
          )}
          {system == null ? (
            <span className="text-[11px] text-[var(--text-muted)]">Verificando hardware…</span>
          ) : system.nvencAvailable ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-500 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
              <Zap className="h-3 w-3" /> GPU NVENC listo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-card)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
              <Cpu className="h-3 w-3" /> Motor CPU x264
            </span>
          )}
        </div>
      </div>

      {/* Área principal */}
      <div className="flex min-h-0 flex-1 gap-4">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <DropZone
            compact={jobs.length > 0}
            isDragging={isDragging}
            busy={analyzing}
            onBrowse={() => void browseFiles()}
          />
          {jobs.length > 0 && (
            <QueueList
              jobs={jobs}
              onRemove={removeJob}
              onRetry={retryJob}
              onReveal={reveal}
              onClearCompleted={clearCompleted}
            />
          )}
        </main>

        <aside className="flex w-[320px] shrink-0 flex-col gap-4 overflow-y-auto pr-0.5">
          <SettingsPanel
            settings={settings}
            system={system}
            disabled={running}
            onChange={updateSettings}
            onPickFolder={() => void pickFolder()}
          />
          <ActionPanel
            jobs={jobs}
            running={running}
            stopping={stopping}
            onStart={() => void startQueue()}
            onCancel={() => void cancelCurrent()}
            onClearCompleted={clearCompleted}
          />
        </aside>
      </div>

      <GlobalToast message={toast} type="info" />
    </div>
  )
}

