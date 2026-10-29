import { useState, useEffect } from 'react'
import { Layers } from 'lucide-react'
import type { OrganizedPageSpec, ThumbnailQuality } from '../../shared/types'
import { ThumbnailCard } from './ThumbnailCard'

interface PageGridProps {
  pages: OrganizedPageSpec[]
  showRealThumbnails: boolean
  quality: ThumbnailQuality
  maxAutoPages: number
  selectable?: boolean
  selectedPageIds?: string[]
  onToggleSelectPage?: (page: OrganizedPageSpec) => void
  onRotatePage?: (id: string, delta: 90 | 270) => void
  onDeletePage?: (id: string) => void
  onMovePage?: (index: number, direction: -1 | 1) => void
}

const BATCH_SIZE = 20

export function PageGrid({
  pages,
  showRealThumbnails,
  quality,
  maxAutoPages,
  selectable = false,
  selectedPageIds = [],
  onToggleSelectPage,
  onRotatePage,
  onDeletePage,
  onMovePage
}: PageGridProps): JSX.Element {
  const initialLimit =
    pages.length > maxAutoPages ? BATCH_SIZE : Math.min(pages.length, maxAutoPages)
  const [visibleCount, setVisibleCount] = useState(initialLimit || BATCH_SIZE)

  useEffect(() => {
    const nextLimit =
      pages.length > maxAutoPages ? BATCH_SIZE : Math.min(pages.length, maxAutoPages)
    setVisibleCount(Math.max(BATCH_SIZE, nextLimit))
  }, [pages.length, maxAutoPages])

  const visiblePages = pages.slice(0, visibleCount)
  const remaining = Math.max(0, pages.length - visibleCount)

  return (
    <div className="space-y-4">
      {pages.length > maxAutoPages && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-300">
          <span>
            Documento grande ({pages.length} páginas). Mostrando {visiblePages.length} vistas previas por lotes para proteger la memoria RAM.
          </span>
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => Math.min(pages.length, prev + BATCH_SIZE))}
              className="rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-200 transition hover:bg-amber-500/30"
            >
              Cargar +20 ({remaining} restantes)
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visiblePages.map((p, idx) => (
          <ThumbnailCard
            key={p.id}
            filePath={p.sourceFilePath}
            pageNumber={p.originalPageNumber}
            displayIndex={idx + 1}
            rotation={p.rotation}
            selectable={selectable}
            selected={selectedPageIds.includes(p.id)}
            showRealThumbnails={showRealThumbnails}
            quality={quality}
            badgeText={p.sourceFileName}
            canMoveLeft={idx > 0}
            canMoveRight={idx < pages.length - 1}
            onToggleSelect={onToggleSelectPage ? () => onToggleSelectPage(p) : undefined}
            onRotateLeft={onRotatePage ? () => onRotatePage(p.id, 270) : undefined}
            onRotateRight={onRotatePage ? () => onRotatePage(p.id, 90) : undefined}
            onDelete={onDeletePage ? () => onDeletePage(p.id) : undefined}
            onMoveLeft={onMovePage ? () => onMovePage(idx, -1) : undefined}
            onMoveRight={onMovePage ? () => onMovePage(idx, 1) : undefined}
          />
        ))}
      </div>

      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => Math.min(pages.length, prev + BATCH_SIZE))}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-card-hover)]"
          >
            <Layers className="h-3.5 w-3.5 text-rose-400" />
            Cargar más vistas previas ({remaining} páginas restantes)
          </button>
        </div>
      )}
    </div>
  )
}

