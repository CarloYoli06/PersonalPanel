import { useEffect, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RotateCcw,
  RotateCw,
  Trash2
} from 'lucide-react'
import type { ThumbnailQuality } from '../../shared/types'
import { renderPageThumbnail } from '../lib/pdfThumbnailRenderer'

interface ThumbnailCardProps {
  filePath: string
  pageNumber: number // 1-based original page number
  displayIndex: number // 1-based current position
  rotation?: 0 | 90 | 180 | 270
  selected?: boolean
  selectable?: boolean
  showRealThumbnails: boolean
  quality: ThumbnailQuality
  badgeText?: string
  canMoveLeft?: boolean
  canMoveRight?: boolean
  onToggleSelect?: () => void
  onRotateLeft?: () => void
  onRotateRight?: () => void
  onDelete?: () => void
  onMoveLeft?: () => void
  onMoveRight?: () => void
}

export function ThumbnailCard({
  filePath,
  pageNumber,
  displayIndex,
  rotation = 0,
  selected = false,
  selectable = false,
  showRealThumbnails,
  quality,
  badgeText,
  canMoveLeft,
  canMoveRight,
  onToggleSelect,
  onRotateLeft,
  onRotateRight,
  onDelete,
  onMoveLeft,
  onMoveRight
}: ThumbnailCardProps): JSX.Element {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    if (!showRealThumbnails) {
      setThumbUrl(null)
      return
    }
    setLoading(true)
    renderPageThumbnail(filePath, pageNumber, quality)
      .then((url) => {
        if (mounted) setThumbUrl(url)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [filePath, pageNumber, showRealThumbnails, quality])

  return (
    <div
      onClick={selectable ? onToggleSelect : undefined}
      className={`group relative flex flex-col justify-between rounded-xl border p-2.5 transition-all duration-150 ${
        selectable ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/30'
          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-rose-500/35 hover:bg-[var(--bg-card-hover)]'
      }`}
    >
      {/* Cabecera de página */}
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--text-primary)]">
          Pág. {displayIndex}
          {displayIndex !== pageNumber && (
            <span className="text-[9px] font-normal text-[var(--text-muted)]">
              (orig. {pageNumber})
            </span>
          )}
        </span>

        {badgeText && (
          <span
            className="max-w-[90px] truncate rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-medium text-rose-400"
            title={badgeText}
          >
            {badgeText}
          </span>
        )}

        {selectable && (
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
              selected
                ? 'border-rose-500 bg-rose-500 text-white'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-transparent'
            }`}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>

      {/* Lienzo de miniatura o tarjeta ligera */}
      <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-zinc-900/40">
        {showRealThumbnails && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`Página ${pageNumber}`}
            style={{ transform: `rotate(${rotation}deg)` }}
            className="h-full w-full object-contain transition-transform duration-200"
          />
        ) : loading ? (
          <div className="flex flex-col items-center gap-1.5 text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-rose-400" />
            <span className="text-[10px]">Renderizando…</span>
          </div>
        ) : (
          <div
            style={{ transform: `rotate(${rotation}deg)` }}
            className="flex flex-col items-center gap-1.5 text-[var(--text-muted)] transition-transform duration-200"
          >
            <FileText className="h-8 w-8 text-rose-400/60" />
            <span className="font-mono text-[11px] font-semibold">Página {pageNumber}</span>
          </div>
        )}

        {rotation !== 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-400">
            {rotation}°
          </span>
        )}
      </div>

      {/* Controles de edición de página (Organizar / Rotar / Eliminar) */}
      {(onRotateLeft || onRotateRight || onDelete || onMoveLeft || onMoveRight) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-1.5"
        >
          <div className="flex items-center gap-0.5">
            {onMoveLeft && (
              <button
                type="button"
                disabled={!canMoveLeft}
                onClick={onMoveLeft}
                title="Mover antes"
                className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-25"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {onMoveRight && (
              <button
                type="button"
                disabled={!canMoveRight}
                onClick={onMoveRight}
                title="Mover después"
                className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-25"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {onRotateLeft && (
              <button
                type="button"
                onClick={onRotateLeft}
                title="Rotar 90° izquierda"
                className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {onRotateRight && (
              <button
                type="button"
                onClick={onRotateRight}
                title="Rotar 90° derecha"
                className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                title="Eliminar página"
                className="rounded p-1 text-rose-400 hover:bg-rose-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

