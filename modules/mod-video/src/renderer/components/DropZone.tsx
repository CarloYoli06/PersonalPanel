import { FolderOpen, Loader2, UploadCloud } from 'lucide-react'

interface DropZoneProps {
  compact: boolean
  isDragging: boolean
  busy: boolean
  onBrowse: () => void
}

export function DropZone({ compact, isDragging, busy, onBrowse }: DropZoneProps): JSX.Element {
  const base =
    'group relative flex w-full items-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300'
  const state = isDragging
    ? 'border-violet-400/80 bg-violet-500/10 shadow-[0_0_60px_-15px_rgba(139,92,246,0.5)]'
    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-violet-400/40 hover:bg-[var(--bg-card-hover)]'

  if (compact) {
    return (
      <button
        id="dropzone-compact"
        type="button"
        onClick={onBrowse}
        disabled={busy}
        className={`${base} ${state} gap-4 px-5 py-4 text-left`}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          ) : (
            <UploadCloud className="h-5 w-5 text-violet-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {isDragging
              ? 'Suelta para añadir a la cola'
              : busy
                ? 'Analizando videos…'
                : 'Arrastra más videos aquí'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            MP4, MKV, MOV o AVI · cada archivo se comprime por separado
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition group-hover:bg-[var(--bg-card-hover)] group-hover:text-[var(--text-primary)]">
          <FolderOpen className="h-3.5 w-3.5" /> Examinar
        </span>
      </button>
    )
  }

  return (
    <button
      id="dropzone"
      type="button"
      onClick={onBrowse}
      disabled={busy}
      className={`${base} ${state} flex-1 flex-col justify-center gap-5 p-10`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_200px_at_50%_40%,rgba(139,92,246,0.10),transparent)]" />
      <div className="relative animate-float">
        <div className="absolute inset-0 rounded-3xl bg-violet-500/30 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-2xl shadow-violet-900/40">
          {busy ? (
            <Loader2 className="h-9 w-9 animate-spin text-white" />
          ) : (
            <UploadCloud className="h-9 w-9 text-white" strokeWidth={2} />
          )}
        </div>
      </div>
      <div className="relative text-center">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          {isDragging ? 'Suelta tus videos' : busy ? 'Analizando videos…' : 'Arrastra tus videos aquí'}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          Reduce archivos de ~1 GB a ~200–300 MB sin pérdida visible con aceleración NVENC o x264.
        </p>
      </div>
      <div className="relative flex items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition group-hover:bg-[var(--bg-card-hover)]">
          <FolderOpen className="h-4 w-4 text-violet-400" /> Seleccionar archivos
        </span>
      </div>
      <div className="relative flex gap-2">
        {['MP4', 'MKV', 'MOV', 'AVI'].map((ext) => (
          <span
            key={ext}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--text-muted)]"
          >
            {ext}
          </span>
        ))}
      </div>
    </button>
  )
}

