import type { ReactNode } from 'react'
import { CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react'

export function Switch({
  id,
  checked,
  onChange,
  disabled,
  accent = 'violet'
}: {
  id?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  accent?: 'violet' | 'cyan' | 'emerald'
}): JSX.Element {
  const activeBg =
    accent === 'cyan'
      ? 'bg-cyan-500'
      : accent === 'emerald'
        ? 'bg-emerald-500'
        : 'bg-violet-500'

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? activeBg : 'bg-[var(--switch-off)]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function StatusBadge({
  status,
  label
}: {
  status: 'ready' | 'running' | 'disabled' | 'warning' | 'error'
  label: string
}): JSX.Element {
  const styles: Record<typeof status, string> = {
    ready: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-300 ring-emerald-500/25',
    running: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-violet-500/30',
    disabled: 'bg-[var(--bg-card)] text-[var(--text-muted)] ring-[var(--border-subtle)]',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/25',
    error: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 ring-rose-500/25'
  }
  const dotStyles: Record<typeof status, string> = {
    ready: 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]',
    running: 'bg-violet-400 animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.9)]',
    disabled: 'bg-[var(--text-muted)]',
    warning: 'bg-amber-400',
    error: 'bg-rose-400'
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${styles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {label}
    </span>
  )
}

export function PanelCard({
  children,
  className = ''
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <section
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] backdrop-blur-xl transition-colors ${className}`}
    >
      {children}
    </section>
  )
}

export function GlobalToast({
  message,
  type = 'info'
}: {
  message: string | null
  type?: 'info' | 'success' | 'warning' | 'error'
}): JSX.Element | null {
  if (!message) return null
  const Icon =
    type === 'success'
      ? CheckCircle2
      : type === 'warning'
        ? AlertTriangle
        : type === 'error'
          ? XCircle
          : Info
  const iconColor =
    type === 'success'
      ? 'text-emerald-400'
      : type === 'warning'
        ? 'text-amber-400'
        : type === 'error'
          ? 'text-rose-400'
          : 'text-violet-400'

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 animate-fade-up">
      <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5 text-xs font-medium text-[var(--text-primary)] shadow-2xl backdrop-blur-xl">
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span>{message}</span>
      </div>
    </div>
  )
}

