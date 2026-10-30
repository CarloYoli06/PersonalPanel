import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemeMode } from '@panel/core-sdk'
import { useTheme } from './ThemeProvider'
import { useI18n } from '../i18n/I18nProvider'

export function ThemeToggle({ compact = false }: { compact?: boolean }): JSX.Element {
  const { mode, setMode, cycleMode } = useTheme()
  const { t } = useI18n()

  if (compact) {
    const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor
    const label =
      mode === 'dark'
        ? t.theme.modeDark
        : mode === 'light'
          ? t.theme.modeLight
          : t.theme.modeSystem

    const titleText = t.theme.currentTheme.replace('{0}', label)

    return (
      <button
        type="button"
        onClick={cycleMode}
        title={titleText}
        className="app-no-drag inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
      >
        <Icon className="h-3.5 w-3.5 text-violet-400" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    )
  }

  const options: { id: ThemeMode; label: string; icon: typeof Moon }[] = [
    { id: 'dark', label: t.theme.dark, icon: Moon },
    { id: 'light', label: t.theme.light, icon: Sun },
    { id: 'system', label: t.theme.system, icon: Monitor }
  ]

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
      {options.map(({ id, label, icon: Icon }) => {
        const active = mode === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-gradient-to-r from-violet-500/20 to-cyan-500/20 text-[var(--text-primary)] ring-1 ring-violet-500/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? 'text-violet-400' : ''}`} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
