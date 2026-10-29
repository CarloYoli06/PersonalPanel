import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Loader2,
  Sparkles
} from 'lucide-react'
import type { OutputSaveMode, PdfOperationOutput } from '../../shared/types'

function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

interface ActionFooterProps {
  summaryText: string
  actionLabel: string
  busy: boolean
  disabled?: boolean
  outputMode: OutputSaveMode
  lastResult: PdfOperationOutput | null
  onChangeOutputMode: (mode: OutputSaveMode) => void
  onExecute: () => void
  onRevealResult: (targetPath: string) => void
  onOpenResult: (targetPath: string) => void
}

export function ActionFooter({
  summaryText,
  actionLabel,
  busy,
  disabled = false,
  outputMode,
  lastResult,
  onChangeOutputMode,
  onExecute,
  onRevealResult,
  onOpenResult
}: ActionFooterProps): JSX.Element {
  return (
    <div className="shrink-0 space-y-2">
      {/* Banner de resultado reciente con comparativa y acceso directo */}
      {lastResult && lastResult.success && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">{lastResult.message}</p>
              {lastResult.originalBytes && lastResult.outputBytes && (
                <p className="font-mono text-[11px] text-emerald-400">
                  Peso Original: {formatBytes(lastResult.originalBytes)} → Nuevo:{' '}
                  {formatBytes(lastResult.outputBytes)}
                  {typeof lastResult.savedPercent === 'number' && lastResult.savedPercent > 0
                    ? ` (-${lastResult.savedPercent}% ahorrado)`
                    : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastResult.outputPath && (
              <>
                <button
                  type="button"
                  onClick={() => onRevealResult(lastResult.outputPath!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 font-medium text-emerald-300 transition hover:bg-emerald-500/25"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Mostrar en carpeta
                </button>
                <button
                  type="button"
                  onClick={() => onOpenResult(lastResult.outputPath!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1 font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card-hover)]"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Barra inferior de ejecución y destino de salida */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">{summaryText}</span>

          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Destino:</span>
            <select
              value={outputMode}
              onChange={(e) => onChangeOutputMode(e.target.value as OutputSaveMode)}
              className="bg-transparent font-medium text-[var(--text-primary)] focus:outline-none"
            >
              <option value="same-folder" className="bg-zinc-900 text-zinc-100">
                Misma carpeta del original
              </option>
              <option value="custom-folder" className="bg-zinc-900 text-zinc-100">
                Carpeta predeterminada
              </option>
              <option value="ask-always" className="bg-zinc-900 text-zinc-100">
                Preguntar siempre dónde guardar
              </option>
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={busy || disabled}
          onClick={onExecute}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-45"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando PDF…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {actionLabel}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

