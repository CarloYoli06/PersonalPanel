import type { ModuleManifest } from '@panel/core-sdk'

type Accent = ModuleManifest['accent']

export const TAB_ACTIVE_CLASS: Record<Accent, string> = {
  cyan: 'bg-cyan-500/15 text-[var(--text-primary)] ring-1 ring-cyan-500/35',
  emerald: 'bg-emerald-500/15 text-[var(--text-primary)] ring-1 ring-emerald-500/35',
  rose: 'bg-rose-500/15 text-[var(--text-primary)] ring-1 ring-rose-500/35',
  violet: 'bg-violet-500/15 text-[var(--text-primary)] ring-1 ring-violet-500/35'
}

export const ICON_COLOR_CLASS: Record<Accent, string> = {
  cyan: 'text-cyan-400',
  emerald: 'text-emerald-400',
  rose: 'text-rose-400',
  violet: 'text-violet-400'
}
