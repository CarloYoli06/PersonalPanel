import { FolderOpen, HardDrive, Image as ImageIcon, RotateCcw } from 'lucide-react'
import { PanelCard, Switch } from '@panel/ui-kit'
import type { OutputSaveMode, PdfStudioSettings, ThumbnailQuality } from '../../shared/types'
import { DEFAULT_PDF_SETTINGS } from '../lib/pdfApi'

interface ModuleSettingsProps {
  settings: PdfStudioSettings
  onUpdate: (patch: Partial<PdfStudioSettings>) => void
  onBrowseCustomFolder: () => void
  onResetDefaults: () => void
}

export function ModuleSettings({
  settings,
  onUpdate,
  onBrowseCustomFolder,
  onResetDefaults
}: ModuleSettingsProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 1. Motor de Miniaturas Reales y Rendimiento */}
      <PanelCard className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
            <ImageIcon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Motor de Miniaturas Reales (Rendimiento)
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Controla cómo se previsualizan las páginas mediante pdfjs-dist en memoria.
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Mostrar miniaturas reales de páginas
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Si se desactiva, muestra tarjetas ligeras con ícono y número para consumo mínimo de RAM.
              </p>
            </div>
            <Switch
              checked={settings.showRealThumbnails}
              accent="rose"
              onChange={(v) => onUpdate({ showRealThumbnails: v })}
            />
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Calidad de Miniatura
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Define la resolución de renderizado en el lienzo de previsualización.
                </p>
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    { id: 'low', label: 'Baja (Rápida)' },
                    { id: 'medium', label: 'Media' },
                    { id: 'high', label: 'Alta (Nítida)' }
                  ] as const
                ).map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onUpdate({ thumbnailQuality: q.id as ThumbnailQuality })}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                      settings.thumbnailQuality === q.id
                        ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Límite de seguridad para archivos grandes
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Si un PDF supera este límite de páginas, las vistas previas se cargan en lotes de 20.
                </p>
              </div>
              <select
                value={settings.maxAutoThumbnailPages}
                onChange={(e) =>
                  onUpdate({ maxAutoThumbnailPages: Number(e.target.value) || 100 })
                }
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)]"
              >
                <option value={40} className="bg-zinc-900">
                  40 páginas
                </option>
                <option value={100} className="bg-zinc-900">
                  100 páginas
                </option>
                <option value={200} className="bg-zinc-900">
                  200 páginas
                </option>
                <option value={500} className="bg-zinc-900">
                  500 páginas
                </option>
              </select>
            </div>
          </div>
        </div>
      </PanelCard>

      {/* 2. Comportamiento de Guardado / Carpeta de Salida */}
      <PanelCard className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Comportamiento de Guardado y Salida
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Elige dónde se guardan los archivos PDF e imágenes procesadas por defecto.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onResetDefaults}
            title="Restaurar valores por defecto"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw className="h-3 w-3" /> Restaurar
          </button>
        </div>

        <div className="space-y-3 pt-1">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
            <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">
              Modo de destino predeterminado
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    id: 'same-folder',
                    title: 'Misma carpeta',
                    desc: 'Junto al original con sufijo'
                  },
                  {
                    id: 'custom-folder',
                    title: 'Carpeta fija',
                    desc: 'Directorio predeterminado'
                  },
                  {
                    id: 'ask-always',
                    title: 'Preguntar siempre',
                    desc: 'Abrir diálogo al guardar'
                  }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdate({ outputSaveMode: opt.id as OutputSaveMode })}
                  className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                    settings.outputSaveMode === opt.id
                      ? 'border-rose-500/50 bg-rose-500/15 text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="text-xs font-semibold">{opt.title}</span>
                  <span className="mt-0.5 text-[10px] text-[var(--text-muted)]">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {settings.outputSaveMode === 'custom-folder' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Carpeta predeterminada de salida
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
                  {settings.customOutputDir || 'Documentos (Por defecto)'}
                </p>
              </div>
              <button
                type="button"
                onClick={onBrowseCustomFolder}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/25"
              >
                <FolderOpen className="h-3.5 w-3.5" /> Elegir carpeta
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Sufijo automático de archivos
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Se añade al nombre original para no sobrescribir tus documentos.
              </p>
            </div>
            <input
              type="text"
              value={settings.defaultSuffix}
              onChange={(e) =>
                onUpdate({ defaultSuffix: e.target.value || DEFAULT_PDF_SETTINGS.defaultSuffix })
              }
              placeholder="_editado"
              className="w-36 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Mostrar archivo en el Explorador al terminar
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Resalta automáticamente el archivo PDF o carpeta generada en Windows Explorer.
              </p>
            </div>
            <Switch
              checked={settings.revealInExplorerOnFinish}
              accent="rose"
              onChange={(v) => onUpdate({ revealInExplorerOnFinish: v })}
            />
          </div>
        </div>
      </PanelCard>
    </div>
  )
}

