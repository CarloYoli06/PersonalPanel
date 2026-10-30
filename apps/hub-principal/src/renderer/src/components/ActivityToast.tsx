import { CheckCircle2, XCircle } from 'lucide-react'

export interface ActivityToastData {
  moduleId: string
  status: 'success' | 'error'
  title: string
  body: string
}

interface ActivityToastProps {
  toast: ActivityToastData | null
  viewLabel: string
  onView: (moduleId: string) => void
}

/** Toast accionable ("Ver") para tareas que terminan en un módulo que no está en pantalla. */
export function ActivityToast({ toast, viewLabel, onView }: ActivityToastProps): JSX.Element | null {
  if (!toast) return null
  const ok = toast.status === 'success'
  const Icon = ok ? CheckCircle2 : XCircle
  return (
    <div className="fixed bottom-16 right-5 z-50 animate-fade-up">
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-xl">
        <Icon
          className="h-4 w-4 shrink-0"
          style={{ color: ok ? 'var(--status-success)' : 'var(--status-error)' }}
        />
        <div className="min-w-0">
          <p className="font-semibold">{toast.title}</p>
          <p className="text-[var(--text-secondary)]">{toast.body}</p>
        </div>
        <button
          type="button"
          onClick={() => onView(toast.moduleId)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 font-medium hover:bg-[var(--bg-card-hover)]"
        >
          {viewLabel}
        </button>
      </div>
    </div>
  )
}
