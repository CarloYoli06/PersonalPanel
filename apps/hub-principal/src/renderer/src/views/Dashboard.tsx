import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Cpu,
  FileText,
  GripVertical,
  Info,
  Layers,
  LayoutGrid,
  List,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap
} from 'lucide-react'
import type { ModuleManifest, ModuleStateSnapshot } from '@panel/core-sdk'
import { StatusBadge, Switch, useI18n } from '@panel/ui-kit'

interface DashboardViewProps {
  modules: readonly ModuleManifest[]
  moduleStates: Record<string, ModuleStateSnapshot>
  onOpenModule: (moduleId: string) => void
  onToggleModule: (moduleId: string, enabled: boolean) => void
  onOpenSettings: () => void
  onReorderModules?: (nextOrder: string[]) => void
}

function ModuleIcon({
  icon,
  accent,
  compact
}: {
  icon: ModuleManifest['icon']
  accent: ModuleManifest['accent']
  compact?: boolean
}): JSX.Element {
  const gradient =
    accent === 'cyan'
      ? 'from-cyan-500 to-violet-600 shadow-cyan-500/25'
      : accent === 'emerald'
        ? 'from-emerald-500 to-teal-600 shadow-emerald-500/25'
        : accent === 'rose'
          ? 'from-rose-500 to-orange-500 shadow-rose-500/25'
          : 'from-violet-500 to-fuchsia-500 shadow-violet-500/25'

  const Icon =
    icon === 'scan'
      ? ScanLine
      : icon === 'video'
        ? Clapperboard
        : icon === 'wrench'
          ? Wrench
          : icon === 'file-text'
            ? FileText
            : Sparkles

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-md ${
        compact ? 'h-10 w-10' : 'h-11 w-11'
      }`}
    >
      <Icon className={compact ? 'h-5 w-5' : 'h-5 w-5'} strokeWidth={2.2} />
    </div>
  )
}

export function DashboardView({
  modules,
  moduleStates,
  onOpenModule,
  onToggleModule,
  onOpenSettings,
  onReorderModules
}: DashboardViewProps): JSX.Element {
  const { t } = useI18n()
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('panel-personal:dashboard-compact')
      return saved ? JSON.parse(saved) : true
    } catch {
      return true
    }
  })

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const draggedIdRef = useRef<string | null>(null)

  const toggleCompactMode = (): void => {
    setCompactMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem('panel-personal:dashboard-compact', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const moveModule = useCallback(
    (fromIndex: number, toIndex: number): void => {
      if (!onReorderModules) return
      if (toIndex < 0 || toIndex >= modules.length || fromIndex === toIndex) return
      const currentOrder = modules.map((m) => m.id)
      const [moved] = currentOrder.splice(fromIndex, 1)
      currentOrder.splice(toIndex, 0, moved)
      onReorderModules(currentOrder)
    },
    [modules, onReorderModules]
  )

  const handleDrop = useCallback(
    (targetId: string, sourceIdFromEvent?: string | null): void => {
      const sourceId = sourceIdFromEvent || draggedIdRef.current || draggedId
      if (!sourceId || sourceId === targetId || !onReorderModules) {
        draggedIdRef.current = null
        setDraggedId(null)
        setDragOverId(null)
        return
      }
      const currentOrder = modules.map((m) => m.id)
      const fromIdx = currentOrder.indexOf(sourceId)
      const toIdx = currentOrder.indexOf(targetId)
      if (fromIdx !== -1 && toIdx !== -1) {
        moveModule(fromIdx, toIdx)
      }
      draggedIdRef.current = null
      setDraggedId(null)
      setDragOverId(null)
    },
    [draggedId, modules, moveModule, onReorderModules]
  )

  // Sistema de arrastre con Pointer Events (compatible 100% con Windows WebView2 / Tauri v2)
  const pointerDragRef = useRef<{
    active: boolean
    sourceId: string | null
    startX: number
    startY: number
  }>({
    active: false,
    sourceId: null,
    startX: 0,
    startY: 0
  })

  const handlePointerDown = (e: React.PointerEvent, modId: string) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Ignorar si hace clic en controles interactivos (botones, switches, inputs, popovers)
    if (target.closest('button, input, [role="switch"], a, .no-drag')) return

    pointerDragRef.current = {
      active: true,
      sourceId: modId,
      startX: e.clientX,
      startY: e.clientY
    }
  }

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      const p = pointerDragRef.current
      if (!p.active || !p.sourceId) return

      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
      if (dist > 5) {
        if (draggedIdRef.current !== p.sourceId) {
          draggedIdRef.current = p.sourceId
          setDraggedId(p.sourceId)
        }

        const elem = document.elementFromPoint(e.clientX, e.clientY)
        const targetCard = elem?.closest('[data-module-id]')
        const targetId = targetCard?.getAttribute('data-module-id')
        if (targetId && targetId !== p.sourceId) {
          setDragOverId(targetId)
        } else if (!targetId) {
          setDragOverId(null)
        }
      }
    }

    const handleGlobalPointerUp = (e: PointerEvent) => {
      const p = pointerDragRef.current
      if (p.active && draggedIdRef.current) {
        const elem = document.elementFromPoint(e.clientX, e.clientY)
        const targetCard = elem?.closest('[data-module-id]')
        const targetId = targetCard?.getAttribute('data-module-id') || dragOverId
        if (targetId && targetId !== draggedIdRef.current) {
          handleDrop(targetId, draggedIdRef.current)
        } else {
          draggedIdRef.current = null
          setDraggedId(null)
          setDragOverId(null)
        }
      }
      pointerDragRef.current = { active: false, sourceId: null, startX: 0, startY: 0 }
    }

    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: true })
    window.addEventListener('pointerup', handleGlobalPointerUp)
    window.addEventListener('pointercancel', handleGlobalPointerUp)

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove)
      window.removeEventListener('pointerup', handleGlobalPointerUp)
      window.removeEventListener('pointercancel', handleGlobalPointerUp)
    }
  }, [dragOverId, handleDrop])

  const enabledCount = modules.filter((m) => moduleStates[m.id]?.enabled !== false).length
  const runningCount = modules.filter((m) => moduleStates[m.id]?.running).length

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Hero Banner compacto con shrink-0 para evitar recortes visuales */}
      <section className="panel relative shrink-0 overflow-hidden px-5 py-4">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-32 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[260px] flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              <Zap className="h-3 w-3 text-violet-400" />
              {t.dashboard.badge}
            </div>
            <h1 className="mt-1.5 text-lg font-bold tracking-tight text-[var(--text-primary)] sm:text-xl">
              {t.dashboard.heroTitle}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {t.dashboard.heroSubtitle}
            </p>
          </div>

          {/* Métricas de rendimiento del ecosistema */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2 text-center">
              <p className="text-base font-bold tabular-nums text-[var(--text-primary)]">
                {enabledCount}/{modules.length}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t.dashboard.activeCountLabel}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2 text-center">
              <p
                className={`text-base font-bold tabular-nums ${
                  runningCount > 0
                    ? 'text-violet-400'
                    : 'text-emerald-500 dark:text-emerald-400'
                }`}
              >
                {runningCount}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t.dashboard.processesLabel}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección de Tarjetas de Módulos */}
      <div className="shrink-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              {t.dashboard.workspaceModules}
            </h2>
            <span className="hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] sm:inline-block">
              {t.dashboard.dragHint}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleCompactMode}
              title={
                compactMode
                  ? t.dashboard.detailedView
                  : t.dashboard.compactView
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              {compactMode ? (
                <>
                  <LayoutGrid className="h-3.5 w-3.5 text-violet-400" />
                  <span>{t.dashboard.compactView}</span>
                </>
              ) : (
                <>
                  <List className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{t.dashboard.detailedView}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <Settings className="h-3.5 w-3.5" /> {t.dashboard.manageModules}
            </button>
          </div>
        </div>

        <div
          className={
            compactMode
              ? 'grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3'
              : 'grid grid-cols-1 gap-4 lg:grid-cols-2'
          }
        >
          {modules.map((mod, index) => {
            const st = moduleStates[mod.id]
            const enabled = st ? st.enabled : mod.defaultEnabled
            const running = Boolean(st?.running)
            const localized = t.modules[mod.id as keyof typeof t.modules]
            const modName = localized?.name || mod.name
            const modTagline = localized?.tagline || mod.tagline
            const modDesc = localized?.description || mod.description

            const statusText =
              !enabled
                ? t.common.disabled
                : running
                  ? (st?.statusText && !st.statusText.includes('Listo') ? st.statusText : t.common.runningSubprocess)
                  : t.dashboard.readyResting

            const accentBorder =
              mod.accent === 'cyan'
                ? 'hover:border-cyan-500/40'
                : mod.accent === 'emerald'
                  ? 'hover:border-emerald-500/40'
                  : mod.accent === 'rose'
                    ? 'hover:border-rose-500/40'
                    : 'hover:border-violet-500/40'

            const buttonGradient =
              mod.accent === 'cyan'
                ? 'from-cyan-500 to-violet-600 shadow-cyan-500/20'
                : mod.accent === 'emerald'
                  ? 'from-emerald-500 to-teal-600 shadow-emerald-500/20'
                  : mod.accent === 'rose'
                    ? 'from-rose-500 to-orange-500 shadow-rose-500/20'
                    : 'from-violet-500 to-fuchsia-500 shadow-violet-500/20'

            const isDragging = draggedId === mod.id
            const isDragOver = dragOverId === mod.id && draggedId !== mod.id

            return (
              <article
                key={mod.id}
                data-module-id={mod.id}
                draggable
                onPointerDown={(e) => handlePointerDown(e, mod.id)}
                onDragStart={(e) => {
                  draggedIdRef.current = mod.id
                  setDraggedId(mod.id)
                  e.dataTransfer.setData('text/plain', mod.id)
                  e.dataTransfer.setData('application/x-panel-module', mod.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnter={(e) => {
                  e.preventDefault()
                  if (draggedIdRef.current && draggedIdRef.current !== mod.id) {
                    setDragOverId(mod.id)
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverId !== mod.id && draggedIdRef.current && draggedIdRef.current !== mod.id) {
                    setDragOverId(mod.id)
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverId === mod.id) {
                      setDragOverId(null)
                    }
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const sourceId =
                    e.dataTransfer.getData('application/x-panel-module') ||
                    e.dataTransfer.getData('text/plain') ||
                    draggedIdRef.current
                  handleDrop(mod.id, sourceId)
                }}
                onDragEnd={() => {
                  draggedIdRef.current = null
                  setDraggedId(null)
                  setDragOverId(null)
                }}
                className={`panel draggable-card group relative flex flex-col justify-between transition-all duration-200 cursor-grab active:cursor-grabbing select-none hover:z-20 ${
                  compactMode ? 'p-4' : 'p-5'
                } ${enabled ? accentBorder : 'opacity-65'} ${
                  isDragging ? 'scale-[0.98] opacity-35 border-dashed border-violet-400 ring-2 ring-violet-500/40' : ''
                } ${isDragOver ? 'ring-2 ring-violet-500 bg-violet-500/10 scale-[1.01] shadow-xl' : ''}`}
              >
                {/* Overlay visual cuando se arrastra otra tarjeta sobre esta */}
                {isDragOver && (
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-violet-400 bg-violet-500/20 backdrop-blur-[1px]">
                    <span className="rounded-lg border border-violet-500/40 bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-bold text-violet-300 shadow-xl">
                      {t.dashboard.dropToReorder}
                    </span>
                  </div>
                )}

                <div>
                  {/* Cabecera de la tarjeta */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {/* Handle de arrastre */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, mod.id)}
                        className="flex cursor-grab items-center rounded p-1 text-[var(--text-muted)] opacity-60 transition group-hover:opacity-100 hover:bg-[var(--bg-card)] hover:text-violet-400 active:cursor-grabbing"
                        title={t.dashboard.dragHint}
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>

                      <ModuleIcon icon={mod.icon} accent={mod.accent} compact={compactMode} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {modName}
                          </h3>
                          <span className="shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--text-muted)]">
                            v{mod.version}
                          </span>

                          {/* Botón Hover con Popover de Descripción y Binarios */}
                          <div
                            className="group/info relative inline-flex items-center"
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                              aria-label={t.dashboard.moduleDetails}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>

                            {/* Tooltip / Popover flotante al hacer hover */}
                            <div className="pointer-events-none invisible absolute -left-28 top-6 z-40 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-150 group-hover/info:visible group-hover/info:opacity-100">
                              <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                                {modName}
                              </p>
                              <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                                {modDesc}
                              </p>
                              <div className="mt-2.5 border-t border-[var(--border-subtle)] pt-2">
                                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                  {t.dashboard.onDemandEngines}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {mod.externalBinaries.map((bin) => (
                                    <span
                                      key={bin}
                                      className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]"
                                    >
                                      <Cpu className="h-2.5 w-2.5" /> {bin}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <p
                          className="mt-0.5 truncate text-[11px] font-medium text-[var(--text-secondary)]"
                          title={modTagline}
                        >
                          {modTagline}
                        </p>
                      </div>
                    </div>

                    {/* Acciones rápidas: Botones de mover con un clic + Switch Activar/Desactivar */}
                    <div
                      className="no-drag flex shrink-0 items-center gap-2"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation()
                            moveModule(index, index - 1)
                          }}
                          title={t.dashboard.moveLeft}
                          className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-20"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === modules.length - 1}
                          onClick={(e) => {
                            e.stopPropagation()
                            moveModule(index, index + 1)
                          }}
                          title={t.dashboard.moveRight}
                          className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-20"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div
                        title={
                          enabled
                            ? t.dashboard.enabledTooltip
                            : t.dashboard.disabledTooltip
                        }
                      >
                        <Switch
                          checked={enabled}
                          accent={mod.accent}
                          onChange={(next) => onToggleModule(mod.id, next)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Si está en modo detallado, muestra descripción y binarios inline */}
                  {!compactMode && (
                    <>
                      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {modDesc}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {mod.externalBinaries.map((bin) => (
                          <span
                            key={bin}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]"
                          >
                            <Cpu className="h-2.5 w-2.5" /> {bin}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Pie de la tarjeta: Estado en vivo + Botón Abrir */}
                <div
                  className={`flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] ${
                    compactMode ? 'mt-3.5 pt-3' : 'mt-4 pt-3.5'
                  }`}
                >
                  <StatusBadge
                    status={!enabled ? 'disabled' : running ? 'running' : 'ready'}
                    label={statusText}
                  />

                  {enabled ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onOpenModule(mod.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r ${buttonGradient} px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition hover:brightness-110`}
                    >
                      {t.common.open}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onToggleModule(mod.id, true)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                    >
                      {t.dashboard.enableBtn}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {/* Nota de escalabilidad con shrink-0 */}
      <section className="panel mt-auto flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {t.dashboard.footerContract}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {t.dashboard.footerDesc}
            </p>
          </div>
        </div>
        <span className="hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 font-mono text-[10px] text-[var(--text-muted)] sm:inline-block">
          packages/core-sdk
        </span>
      </section>
    </div>
  )
}
