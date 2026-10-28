import {
  AlertTriangle,
  Check,
  Cpu,
  FolderInput,
  Gauge,
  HardDrive,
  MonitorPlay,
  Zap
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Switch } from '@panel/ui-kit'
import {
  LEVEL_QUALITY,
  type CompressionLevel,
  type CompressionSettings,
  type Engine,
  type SystemInfo
} from '../../shared/types'

interface SettingsPanelProps {
  settings: CompressionSettings
  system: SystemInfo | null
  disabled: boolean
  onChange: (patch: Partial<CompressionSettings>) => void
  onPickFolder: () => void
}

const ENGINES: { id: Engine; title: string; desc: string; icon: LucideIcon }[] = [
  { id: 'nvenc', title: 'GPU · NVIDIA NVENC', desc: 'h264_nvenc · máxima velocidad', icon: Zap },
  { id: 'x264', title: 'CPU · x264', desc: 'libx264 · compatible con cualquier PC', icon: Cpu }
]

const LEVELS: { id: CompressionLevel; title: string; desc: string; tag?: string }[] = [
  { id: 'high', title: 'Calidad Alta', desc: 'Máximo detalle, archivos más grandes' },
  {
    id: 'balanced',
    title: 'Balanceado',
    desc: 'Sin pérdida visible, ~70–80% menos peso',
    tag: 'Recomendado'
  },
  { id: 'max', title: 'Máxima reducción', desc: 'El menor peso posible' }
]

export function SettingsPanel({
  settings,
  system,
  disabled,
  onChange,
  onPickFolder
}: SettingsPanelProps): JSX.Element {
  const qualityLabel = settings.engine === 'nvenc' ? 'CQ' : 'CRF'
  const sameFolder = settings.outputMode === 'same'

  return (
    <section
      className={`panel space-y-5 p-4 transition-opacity ${disabled ? 'opacity-60' : ''}`}
      aria-disabled={disabled}
    >
      {/* Destino */}
      <div>
        <p className="section-label">Destino</p>
        <div className="space-y-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
          <label
            htmlFor="toggle-same-folder"
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2 text-[13px] text-[var(--text-primary)]">
              <HardDrive className="h-4 w-4 text-[var(--text-muted)]" />
              Misma carpeta que el original
            </span>
            <Switch
              id="toggle-same-folder"
              checked={sameFolder}
              disabled={disabled}
              onChange={(v) => onChange({ outputMode: v ? 'same' : 'custom' })}
            />
          </label>
          {sameFolder ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              Se guardará como{' '}
              <span className="font-mono text-[var(--text-secondary)]">nombre_compressed.mp4</span>
            </p>
          ) : (
            <button
              id="pick-output-folder"
              type="button"
              disabled={disabled}
              onClick={onPickFolder}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-card-hover)]"
            >
              <FolderInput className="h-4 w-4 shrink-0 text-violet-400" />
              <span
                className={`truncate ${
                  settings.outputDir ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                }`}
                title={settings.outputDir ?? ''}
              >
                {settings.outputDir ?? 'Elegir carpeta de destino…'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Motor */}
      <div>
        <p className="section-label">Motor de compresión</p>
        <div className="space-y-2">
          {ENGINES.map(({ id, title, desc, icon: Icon }) => {
            const active = settings.engine === id
            const unavailable = id === 'nvenc' && system != null && !system.nvencAvailable
            return (
              <button
                key={id}
                id={`engine-${id}`}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ engine: id })}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-violet-500/40 bg-violet-500/10'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active
                      ? 'bg-violet-500/20 text-violet-500 dark:text-violet-200'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                    {title}
                    {id === 'nvenc' && !unavailable && (
                      <span className="rounded bg-violet-500/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-200">
                        Por defecto
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{desc}</p>
                  {unavailable && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-500">
                      <AlertTriangle className="h-3 w-3" /> No se detectó una GPU NVIDIA compatible
                    </p>
                  )}
                </div>
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ${
                    active ? 'bg-violet-500 ring-violet-400' : 'ring-[var(--border-subtle)]'
                  }`}
                >
                  {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Nivel */}
      <div>
        <p className="section-label">Nivel de compresión</p>
        <div className="space-y-1.5">
          {LEVELS.map(({ id, title, desc, tag }) => {
            const active = settings.level === id
            return (
              <button
                key={id}
                id={`level-${id}`}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ level: id })}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? 'border-violet-500/40 bg-violet-500/10'
                    : 'border-transparent bg-transparent hover:bg-[var(--bg-card)]'
                }`}
              >
                <Gauge
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-violet-400' : 'text-[var(--text-muted)]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-[var(--text-primary)]">
                    {title}
                    {tag && (
                      <span className="text-[10px] font-medium text-fuchsia-500 dark:text-fuchsia-300">
                        {tag}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{desc}</p>
                </div>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    active
                      ? 'bg-violet-500/20 text-violet-600 dark:text-violet-200'
                      : 'bg-[var(--bg-card)] text-[var(--text-muted)]'
                  }`}
                >
                  {qualityLabel} {LEVEL_QUALITY[settings.engine][id]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Resolución */}
      <label
        htmlFor="toggle-1080p"
        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3"
      >
        <span className="flex items-start gap-2">
          <MonitorPlay className="mt-0.5 h-4 w-4 text-[var(--text-muted)]" />
          <span>
            <span className="block text-[13px] text-[var(--text-primary)]">Limitar a 1080p</span>
            <span className="block text-[11px] text-[var(--text-muted)]">
              Reduce 4K/1440p a 1080p
            </span>
          </span>
        </span>
        <Switch
          id="toggle-1080p"
          checked={settings.limitTo1080p}
          disabled={disabled}
          onChange={(v) => onChange({ limitTo1080p: v })}
        />
      </label>

      {system && (
        <p className="truncate text-[10px] text-[var(--text-muted)]" title={system.ffmpegPath}>
          FFmpeg {system.ffmpegVersion} · {system.nvencAvailable ? 'NVENC Activo' : 'CPU x264'}
        </p>
      )}
    </section>
  )
}

