import { VIDEO_EXTENSIONS } from '../../shared/types'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 ** 2
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—'
  const s = Math.round(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'calculando…'
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min ${Math.round(seconds % 60)} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function isVideoFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext)
}

export function createId(): string {
  return crypto.randomUUID()
}

