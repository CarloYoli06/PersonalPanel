import {
  ArrowRight,
  Clapperboard,
  Cpu,
  Layers,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Zap
} from 'lucide-react'
import type { ModuleManifest, ModuleStateSnapshot } from '@panel/core-sdk'
import { StatusBadge, Switch } from '@panel/ui-kit'

interface DashboardViewProps {
  modules: readonly ModuleManifest[]
  moduleStates: Record<string, ModuleStateSnapshot>
  onOpenModule: (moduleId: string) => void
  onToggleModule: (moduleId: string, enabled: boolean) => void
  onOpenSettings: () => void
}

function ModuleIcon({
  icon,
  accent
}: {
  icon: ModuleManifest['icon']
  accent: ModuleManifest['accent']
}): JSX.Element {
  const gradient =
    accent === 'cyan'
      ? 'from-cyan-500 to-violet-600 shadow-cyan-500/25'
      : accent === 'emerald'
        ? 'from-emerald-500 to-teal-600 shadow-emerald-500/25'
        : 'from-violet-500 to-fuchsia-500 shadow-violet-500/25'

  const Icon = icon === 'scan' ? ScanLine : icon === 'video' ? Clapperboard : Sparkles

  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg`}
    >
      <Icon className="h-6 w-6" strokeWidth={2.2} />
    </div>
  )
}

export function DashboardView({
  modules,
  moduleStates,
  onOpenModule,
  onToggleModule,
  onOpenSettings
}: DashboardViewProps): JSX.Element {
  const enabledCount = modules.filter((m) => moduleStates[m.id]?.enabled !== false).length
  const runningCount = modules.filter((m) => moduleStates[m.id]?.running).length

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      {/* Hero Banner estilo PowerToys / Raycast */}
      <section className="panel relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-32 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
              <Zap className="h-3.5 w-3.5 text-violet-400" />
              Arquitectura Modular Ultraligera · Lazy Loading & Subprocesos bajo demanda
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Panel Principal de Herramientas
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              Lanza tus utilidades de escritorio desde un único Hub. Los módulos inactivos no se cargan en memoria RAM y los motores pesados (<code className="rounded bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-xs text-violet-400">FFmpeg</code>, <code className="rounded bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-xs text-cyan-400">WIA Scanner</code>) solo se instancian durante la tarea.
            </p>
          </div>

          {/* Métricas de rendimiento del ecosistema */}
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-center">
              <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">
                {enabledCount}/{modules.length}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Módulos Activos
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-center">
              <p
                className={`text-xl font-bold tabular-nums ${
                  runningCount > 0
                    ? 'text-violet-400'
                    : 'text-emerald-500 dark:text-emerald-400'
                }`}
              >
                {runningCount}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Procesos Hijos
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tarjetas de Módulos */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Módulos Instalados en el Workspace
            </h2>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            <Settings className="h-3.5 w-3.5" /> Gestionar módulos y binarios
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {modules.map((mod) => {
            const st = moduleStates[mod.id]
            const enabled = st ? st.enabled : mod.defaultEnabled
            const running = Boolean(st?.running)
            const statusText =
              st?.statusText ?? (enabled ? 'Listo (0 MB en reposo)' : 'Desactivado')

            const accentBorder =
              mod.accent === 'cyan'
                ? 'hover:border-cyan-500/40'
                : 'hover:border-violet-500/40'

            const buttonGradient =
              mod.accent === 'cyan'
                ? 'from-cyan-500 to-violet-600 shadow-cyan-500/20'
                : 'from-violet-500 to-fuchsia-500 shadow-violet-500/20'

            return (
              <article
                key={mod.id}
                className={`panel group relative flex flex-col justify-between p-5 transition-all duration-200 ${
                  enabled ? accentBorder : 'opacity-65'
                }`}
              >
                <div>
                  {/* Cabecera de la tarjeta */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <ModuleIcon icon={mod.icon} accent={mod.accent} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-[var(--text-primary)]">
                            {mod.name}
                          </h3>
                          <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                            v{mod.version}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-[var(--text-secondary)]">
                          {mod.tagline}
                        </p>
                      </div>
                    </div>

                    {/* Switch rápido Activar/Desactivar */}
                    <div
                      className="flex items-center gap-2"
                      title={
                        enabled
                          ? 'Módulo habilitado (clic para desactivar)'
                          : 'Módulo desactivado (clic para activar)'
                      }
                    >
                      <Switch
                        checked={enabled}
                        accent={mod.accent}
                        onChange={(next) => onToggleModule(mod.id, next)}
                      />
                    </div>
                  </div>

                  {/* Descripción */}
                  <p className="mt-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {mod.description}
                  </p>

                  {/* Binarios externos bajo demanda */}
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {mod.externalBinaries.map((bin) => (
                      <span
                        key={bin}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]"
                      >
                        <Cpu className="h-2.5 w-2.5" /> {bin}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Pie de la tarjeta: Estado en vivo + Botón Abrir */}
                <div className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
                  <StatusBadge
                    status={!enabled ? 'disabled' : running ? 'running' : 'ready'}
                    label={statusText}
                  />

                  {enabled ? (
                    <button
                      type="button"
                      onClick={() => onOpenModule(mod.id)}
                      className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${buttonGradient} px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:brightness-110`}
                    >
                      Abrir herramienta
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleModule(mod.id, true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                    >
                      Habilitar módulo
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {/* Nota de escalabilidad para futuros módulos */}
      <section className="panel flex items-center justify-between gap-4 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Contrato <code className="font-mono text-violet-400">ModuleManifest</code> activo
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Al cerrar un módulo para volver a este Hub, su árbol de interfaz y estados en memoria se desmontan por completo.
            </p>
          </div>
        </div>
        <span className="hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 font-mono text-[10px] text-[var(--text-muted)] sm:inline">
          packages/core-sdk
        </span>
      </section>
    </div>
  )
}

