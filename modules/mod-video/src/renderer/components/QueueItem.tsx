import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  FileVideo,
  FolderSearch,
  Loader2,
  RotateCcw,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useI18n } from '@panel/ui-kit'
import type { Job, JobStatus } from '../../shared/types'
import { formatBytes, formatDuration, formatEta } from '../lib/format'

const STATUS_ICONS: Record<JobStatus, { className: string; icon: LucideIcon }> = {
  pending: {
    className: 'bg-[var(--bg-card)] text-[var(--text-secondary)] ring-[var(--border-subtle)]',
    icon: Clock
  },
  compressing: {
    className: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-violet-500/30',
    icon: Loader2
  },
  done: {
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25',
    icon: CheckCircle2
  },
  error: {
    className: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/25',
    icon: AlertCircle
  },
  cancelled: {
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-amber-500/25',
    icon: Ban
  }
}

interface QueueItemProps {
  job: Job
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onReveal: (path: string) => void
}

export function QueueItem({ job, onRemove, onRetry, onReveal }: QueueItemProps): JSX.Element {
  const { t } = useI18n()
  const meta = STATUS_ICONS[job.status]
  const StatusIcon = meta.icon
  const statusLabel =
    job.status === 'pending'
      ? t.video.statusPending
      : job.status === 'compressing'
        ? t.video.statusCompressing
        : job.status === 'done'
          ? t.video.statusDone
          : job.status === 'error'
            ? t.video.statusError
            : t.video.statusCancelled
  const isActive = job.status === 'compressing'
  const isDone = job.status === 'done'
  const progress = isDone ? 100 : job.progress

  const ratio =
    isDone && job.outputSize != null && job.size > 0 ? 1 - job.outputSize / job.size : null
  const savedPct = ratio != null ? Math.abs(ratio * 100).toFixed(0) : null

  return (
    <li
      className={`group animate-fade-up rounded-xl border p-3.5 transition-colors ${
        isActive
          ? 'border-violet-500/40 bg-violet-500/[0.06]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${
            isDone
              ? 'bg-emerald-500/10 ring-emerald-500/20'
              : 'bg-[var(--bg-surface)] ring-[var(--border-subtle)]'
          }`}
        >
          <FileVideo
            className={`h-5 w-5 ${isDone ? 'text-emerald-400' : 'text-[var(--text-secondary)]'}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={job.path}>
            {job.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="tabular-nums">{formatBytes(job.size)}</span>
            {job.width > 0 && (
              <>
                <span>•</span>
                <span className="tabular-nums">
                  {job.width}×{job.height}
                </span>
              </>
            )}
            {job.duration > 0 && (
              <>
                <span>•</span>
                <span className="tabular-nums">{formatDuration(job.duration)}</span>
              </>
            )}
            {job.codec && job.codec !== 'desconocido' && (
              <>
                <span>•</span>
                <span className="uppercase">{job.codec}</span>
              </>
            )}
          </p>
        </div>

        {isDone && job.outputSize != null && (
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
              <span className="font-normal text-[var(--text-muted)]">{formatBytes(job.size)} → </span>
              {formatBytes(job.outputSize)}
            </p>
            <p
              className={`text-xs font-medium tabular-nums ${
                ratio! >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500'
              }`}
            >
              {ratio! >= 0 ? `−${savedPct}% espacio ahorrado` : `+${savedPct}% más grande`}
            </p>
          </div>
        )}

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${meta.className}`}
        >
          <StatusIcon className={`h-3 w-3 ${isActive ? 'animate-spin' : ''}`} />
          {statusLabel}
        </span>

        <div className="flex shrink-0 items-center">
          {isDone && job.outputPath && (
            <button
              id={`reveal-${job.id}`}
              type="button"
              className="icon-btn"
              title={t.pdf.footer.revealBtn}
              onClick={() => onReveal(job.outputPath!)}
            >
              <FolderSearch className="h-4 w-4" />
            </button>
          )}
          {(job.status === 'error' || job.status === 'cancelled') && (
            <button
              id={`retry-${job.id}`}
              type="button"
              className="icon-btn"
              title="Reintentar"
              onClick={() => onRetry(job.id)}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            id={`remove-${job.id}`}
            type="button"
            className="icon-btn hover:!text-rose-400"
            title="Quitar de la lista"
            disabled={isActive}
            onClick={() => onRemove(job.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {(isActive || isDone || job.status === 'cancelled') && (
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-surface)]">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                isDone
                  ? 'bg-emerald-500'
                  : job.status === 'cancelled'
                    ? 'bg-amber-500/60'
                    : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
              }`}
              style={{ width: `${progress}%` }}
            />
            {isActive && (
              <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)] bg-[length:200%_100%]" />
            )}
          </div>
          <span className="w-12 text-right text-xs font-medium tabular-nums text-[var(--text-secondary)]">
            {progress.toFixed(isActive ? 1 : 0)}%
          </span>
        </div>
      )}

      {isActive && (
        <p className="mt-1.5 text-[11px] tabular-nums text-[var(--text-muted)]">
          {job.fps ? `${Math.round(job.fps)} fps · ` : ''}Tiempo restante: {formatEta(job.etaSeconds)}
        </p>
      )}

      {job.status === 'error' && job.error && (
        <p className="mt-2 select-text rounded-lg bg-rose-500/[0.08] px-3 py-2 text-xs text-rose-400 ring-1 ring-inset ring-rose-500/20">
          {job.error}
        </p>
      )}
    </li>
  )
}

