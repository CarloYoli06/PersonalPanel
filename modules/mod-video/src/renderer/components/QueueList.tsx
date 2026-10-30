import { ListVideo, Trash2 } from 'lucide-react'
import { useI18n } from '@panel/ui-kit'
import type { Job } from '../../shared/types'
import { QueueItem } from './QueueItem'

interface QueueListProps {
  jobs: Job[]
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onReveal: (path: string) => void
  onClearCompleted: () => void
}

export function QueueList({
  jobs,
  onRemove,
  onRetry,
  onReveal,
  onClearCompleted
}: QueueListProps): JSX.Element {
  const { t } = useI18n()
  const completed = jobs.filter((j) => j.status === 'done').length

  return (
    <section className="panel flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <ListVideo className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t.video.queueTitle}</h2>
          <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
            {jobs.length}
          </span>
        </div>
        <button
          id="clear-completed-header"
          type="button"
          onClick={onClearCompleted}
          disabled={completed === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t.video.clearCompleted}
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {jobs.map((job) => (
          <QueueItem
            key={job.id}
            job={job}
            onRemove={onRemove}
            onRetry={onRetry}
            onReveal={onReveal}
          />
        ))}
      </ul>
    </section>
  )
}

