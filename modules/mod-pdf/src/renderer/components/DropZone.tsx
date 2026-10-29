import { useState, useMemo } from 'react'
import { FileText, FolderOpen, Image as ImageIcon, Loader2, UploadCloud } from 'lucide-react'
import { getPdfApi } from '../lib/pdfApi'

interface PdfDropZoneProps {
  mode?: 'pdf' | 'image'
  multiple?: boolean
  compact?: boolean
  busy?: boolean
  title?: string
  subtitle?: string
  onBrowse: () => void
  onDropFiles: (paths: string[]) => void
}

export function PdfDropZone({
  mode = 'pdf',
  multiple = true,
  compact = false,
  busy = false,
  title,
  subtitle,
  onBrowse,
  onDropFiles
}: PdfDropZoneProps): JSX.Element {
  const api = useMemo(() => getPdfApi(), [])
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (busy) return

    const files = Array.from(e.dataTransfer.files)
    const validExts = mode === 'pdf' ? ['.pdf'] : ['.jpg', '.jpeg', '.png', '.webp', '.bmp']
    const paths = files
      .map((f) => {
        try {
          return api.getPathForFile(f) || (f as File & { path?: string }).path || ''
        } catch {
          return (f as File & { path?: string }).path || ''
        }
      })
      .filter((p) => p && validExts.some((ext) => p.toLowerCase().endsWith(ext)))

    if (paths.length > 0) {
      onDropFiles(multiple ? paths : [paths[0]])
    }
  }

  const base =
    'group relative flex w-full items-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200'
  const state = isDragging
    ? 'border-rose-400/80 bg-rose-500/10 shadow-[0_0_50px_-15px_rgba(244,63,94,0.45)]'
    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-rose-500/40 hover:bg-[var(--bg-card-hover)]'

  if (compact) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={busy ? undefined : onBrowse}
        className={`${base} ${state} cursor-pointer justify-between gap-4 px-4 py-3`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'pdf' ? (
              <FileText className="h-4 w-4" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {title ??
                (mode === 'pdf'
                  ? 'Arrastra más archivos PDF aquí o haz clic para añadir'
                  : 'Arrastra más imágenes aquí (JPG, PNG, WEBP)')}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {subtitle ?? 'Procesamiento directo en disco sin límite de tamaño'}
            </p>
          </div>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition group-hover:bg-[var(--bg-card-hover)] group-hover:text-[var(--text-primary)]">
          <FolderOpen className="h-3.5 w-3.5 text-rose-400" /> Examinar
        </span>
      </div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={busy ? undefined : onBrowse}
      className={`${base} ${state} min-h-[230px] cursor-pointer flex-col justify-center gap-4 p-8 text-center`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(360px_180px_at_50%_40%,rgba(244,63,94,0.09),transparent)]" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-xl shadow-rose-900/30">
        {busy ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : (
          <UploadCloud className="h-8 w-8" strokeWidth={2} />
        )}
      </div>

      <div className="relative max-w-md">
        <h3 className="text-base font-bold text-[var(--text-primary)]">
          {title ??
            (isDragging
              ? 'Suelta tus archivos aquí'
              : mode === 'pdf'
                ? multiple
                  ? 'Arrastra tus archivos PDF aquí'
                  : 'Selecciona o arrastra un documento PDF'
                : 'Arrastra tus imágenes (JPG, PNG, WEBP) aquí')}
        </h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {subtitle ??
            'Soporta documentos grandes y escaneos pesados con lectura directa en disco y miniaturas bajo demanda.'}
        </p>
      </div>

      <span className="relative inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-400 transition group-hover:bg-rose-500/25">
        <FolderOpen className="h-4 w-4" />
        {mode === 'pdf'
          ? multiple
            ? 'Seleccionar archivos PDF'
            : 'Elegir archivo PDF'
          : 'Seleccionar imágenes'}
      </span>
    </div>
  )
}
