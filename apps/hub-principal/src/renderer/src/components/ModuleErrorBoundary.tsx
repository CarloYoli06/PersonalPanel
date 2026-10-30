import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  title: string
  retryLabel: string
  onRetry: () => void
}

export class ModuleErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[ModuleErrorBoundary]', error)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="panel flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--status-error)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">{this.props.title}</p>
        <p className="max-w-md text-xs text-[var(--text-muted)]">{error.message}</p>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null })
            this.props.onRetry()
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {this.props.retryLabel}
        </button>
      </div>
    )
  }
}
