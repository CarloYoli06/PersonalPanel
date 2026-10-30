import { Check, Clapperboard, FileText, ScanLine, Sparkles, Wrench, X } from 'lucide-react'
import type { ModuleActivity, ModuleManifest } from '@panel/core-sdk'
import { formatMessage, useI18n } from '@panel/ui-kit'
import { ICON_COLOR_CLASS, TAB_ACTIVE_CLASS } from '../lib/accents'

function NavIcon({ icon }: { icon: ModuleManifest['icon'] }): JSX.Element {
  if (icon === 'video') return <Clapperboard className="h-4 w-4" />
  if (icon === 'scan') return <ScanLine className="h-4 w-4" />
  if (icon === 'wrench') return <Wrench className="h-4 w-4" />
  if (icon === 'file-text') return <FileText className="h-4 w-4" />
  return <Sparkles className="h-4 w-4" />
}

interface ModuleTabProps {
  module: ModuleManifest
  selected: boolean
  activity: ModuleActivity | undefined
  onSelect: () => void
}

export function ModuleTab({ module: mod, selected, activity, onSelect }: ModuleTabProps): JSX.Element {
  const { t } = useI18n()
  const status = activity?.status ?? 'idle'
  const running = status === 'running'
  const showSuccess = status === 'success' && Boolean(activity?.unseen)
  const showError = status === 'error' && Boolean(activity?.unseen)
  const progress = activity?.progress
  const pct = typeof progress === 'number' ? progress : null

  const name =
    t.modules[mod.id as keyof typeof t.modules]?.shortName || mod.name.split('·')[0].trim()

  let tooltip: string | undefined
  if (running) {
    tooltip = [
      activity?.label ?? t.activity.running,
      pct !== null ? formatMessage(t.activity.progress, { pct: Math.round(pct) }) : ''
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (showSuccess || showError) {
    const head = showSuccess ? t.activity.done : t.activity.failed
    tooltip = activity?.message ? `${head} · ${activity.message}` : head
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      title={tooltip}
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-2.5 py-1 text-xs font-medium transition ${
        selected
          ? TAB_ACTIVE_CLASS[mod.accent]
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
      } ${showError ? 'tab-error-shake' : ''} ${showSuccess ? 'tab-success-glow' : ''}`}
    >
      <span className={`${ICON_COLOR_CLASS[mod.accent]} ${running ? 'tab-icon-running' : ''}`}>
        <NavIcon icon={mod.icon} />
      </span>
      <span>{name}</span>

      {(showSuccess || showError) && (
        <span
          className="tab-badge-pop inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: showSuccess ? 'var(--status-success)' : 'var(--status-error)' }}
        >
          {showSuccess ? (
            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
          ) : (
            <X className="h-2.5 w-2.5" strokeWidth={3.5} />
          )}
        </span>
      )}

      {running && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--border-subtle)]">
          <span
            className={`block h-full ${pct !== null ? 'transition-[width] duration-300' : 'tab-bar-indeterminate'}`}
            style={{
              backgroundColor: 'var(--status-running)',
              ...(pct !== null ? { width: `${Math.max(4, Math.min(100, pct))}%` } : {})
            }}
          />
        </span>
      )}
    </button>
  )
}
