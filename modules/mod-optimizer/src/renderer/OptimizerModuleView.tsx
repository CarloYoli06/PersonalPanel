import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Trash2,
  Shield,
  Gauge,
  Power,
  RefreshCw,
  HardDrive,
  Cpu,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import type { ModuleViewProps } from '@panel/core-sdk'
import { PanelCard, Switch, GlobalToast } from '@panel/ui-kit'
import type {
  CleanableCategory,
  PrivacyTweaksOptions,
  VisualTweaksOptions,
  StartupApp,
  SystemMetrics
} from '../shared/types'
import { getOptimizerApi, isElectronOptimizer } from './lib/optimizerApi'

type TabType = 'clean' | 'privacy' | 'performance' | 'startup'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 ** 2
  return `${mb.toFixed(0)} MB`
}

export default function OptimizerModuleView({ onStatusChange }: ModuleViewProps): JSX.Element {
  const api = useMemo(() => getOptimizerApi(), [])
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  const [activeTab, setActiveTab] = useState<TabType>('clean')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null)

  // Estados de datos
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [cleanItems, setCleanItems] = useState<CleanableCategory[]>([])
  const [selectedCleanIds, setSelectedCleanIds] = useState<string[]>([])
  const [startupApps, setStartupApps] = useState<StartupApp[]>([])

  const [privacy, setPrivacy] = useState<PrivacyTweaksOptions>({
    disableDiagTrack: true,
    disableAdvertisingId: true,
    disableFeedback: true,
    disableCortana: true
  })

  const [visual, setVisual] = useState<VisualTweaksOptions>({
    disableWindowAnimations: true,
    disableTransparency: false,
    disableTaskbarAnimations: true
  })

  const notify = useCallback((msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }, [])

  const refreshMetrics = useCallback(async () => {
    try {
      const data = await api.getMetrics()
      setMetrics(data)
    } catch {
      /* ignore */
    }
  }, [api])

  const scanningRef = useRef(false)

  const refreshCleaningScan = useCallback(async () => {
    if (scanningRef.current) return
    scanningRef.current = true
    setLoading(true)
    onStatusChangeRef.current?.(true, 'Escaneando archivos residuales...')
    try {
      const items = await api.scanCleanableItems()
      setCleanItems(items)
      setSelectedCleanIds(items.map((i) => i.id))
    } catch {
      notify('Error al escanear temporales', 'error')
    } finally {
      scanningRef.current = false
      setLoading(false)
      onStatusChangeRef.current?.(false, 'Listo')
    }
  }, [api, notify])

  const refreshPrivacy = useCallback(async () => {
    try {
      const p = await api.getTelemetryStatus()
      setPrivacy(p)
    } catch {
      /* ignore */
    }
  }, [api])

  const refreshVisual = useCallback(async () => {
    try {
      const v = await api.getVisualStatus()
      setVisual(v)
    } catch {
      /* ignore */
    }
  }, [api])

  const refreshStartup = useCallback(async () => {
    try {
      const apps = await api.getStartupApps()
      setStartupApps(apps)
    } catch {
      /* ignore */
    }
  }, [api])

  // Cargar datos al montar
  useEffect(() => {
    refreshMetrics()
    refreshCleaningScan()
    refreshPrivacy()
    refreshVisual()
    refreshStartup()

    const timer = setInterval(refreshMetrics, 5000)
    return () => clearInterval(timer)
  }, [refreshMetrics, refreshCleaningScan, refreshPrivacy, refreshVisual, refreshStartup])

  const handleExecuteClean = async (): Promise<void> => {
    if (selectedCleanIds.length === 0) {
      notify('Selecciona al menos una categoría', 'warning')
      return
    }
    setLoading(true)
    onStatusChangeRef.current?.(true, 'Limpiando archivos del sistema...')
    try {
      const res = await api.executeCleaning(selectedCleanIds)
      if (res.success) {
        notify(`Limpieza completada: ${formatBytes(res.freedBytes ?? 0)} liberados`, 'success')
        await refreshCleaningScan()
        await refreshMetrics()
      } else {
        notify(res.error ?? 'Error en la limpieza', 'error')
      }
    } finally {
      setLoading(false)
      onStatusChangeRef.current?.(false, 'Listo')
    }
  }

  const handleApplyPrivacy = async (opts: PrivacyTweaksOptions): Promise<void> => {
    setPrivacy(opts)
    setLoading(true)
    onStatusChangeRef.current?.(true, 'Aplicando ajustes de privacidad...')
    try {
      const res = await api.applyPrivacyTweaks(opts)
      notify(res.message, res.success ? 'success' : 'error')
    } finally {
      setLoading(false)
      onStatusChangeRef.current?.(false, 'Listo')
    }
  }

  const handleApplyVisual = async (opts: VisualTweaksOptions): Promise<void> => {
    setVisual(opts)
    setLoading(true)
    onStatusChangeRef.current?.(true, 'Ajustando rendimiento visual...')
    try {
      const res = await api.applyVisualTweaks(opts)
      notify(res.message, res.success ? 'success' : 'error')
    } finally {
      setLoading(false)
      onStatusChangeRef.current?.(false, 'Listo')
    }
  }

  const handleToggleStartup = async (app: StartupApp, enable: boolean): Promise<void> => {
    try {
      const res = await api.toggleStartupApp(app.id, app.location, enable)
      if (res.success) {
        setStartupApps((prev) =>
          prev.map((a) => (a.id === app.id && a.location === app.location ? { ...a, enabled: enable } : a))
        )
        notify(`${app.name}: ${enable ? 'habilitado' : 'deshabilitado'} en el inicio`, 'success')
      }
    } catch {
      notify('Error al modificar aplicación de inicio', 'error')
    }
  }

  const handleTrimMemory = async (): Promise<void> => {
    setLoading(true)
    onStatusChangeRef.current?.(true, 'Optimizando memoria RAM...')
    try {
      const res = await api.trimMemory()
      notify(res.message, 'success')
      await refreshMetrics()
    } finally {
      setLoading(false)
      onStatusChangeRef.current?.(false, 'Listo')
    }
  }

  const totalCleanBytes = useMemo(() => {
    return cleanItems
      .filter((i) => selectedCleanIds.includes(i.id))
      .reduce((acc, curr) => acc + curr.sizeBytes, 0)
  }, [cleanItems, selectedCleanIds])

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Sub-header con Métricas de Windows */}
      <div className="flex shrink-0 items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">PC Optimizer Hub</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Limpieza, privacidad, telemetría y aceleración de Windows bajo demanda
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isElectronOptimizer && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-500">
              Modo Simulación
            </span>
          )}

          {metrics && (
            <div className="flex items-center gap-4 font-mono text-xs">
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <Cpu className="h-4 w-4 text-emerald-400" />
                CPU: <strong className="text-[var(--text-primary)]">{metrics.cpuUsagePercent}%</strong>
              </span>
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <Zap className="h-4 w-4 text-violet-400" />
                RAM: <strong className="text-[var(--text-primary)]">{Math.round((metrics.usedRamMb / (metrics.totalRamMb || 1)) * 100)}%</strong>
              </span>
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <HardDrive className="h-4 w-4 text-cyan-400" />
                C: <strong className="text-[var(--text-primary)]">{metrics.systemDriveFreeGb} GB libres</strong>
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleTrimMemory()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-40"
            title="Libera búferes en segundo plano"
          >
            <Zap className="h-3.5 w-3.5" /> Liberar RAM
          </button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-2">
        {[
          { id: 'clean', label: 'Limpieza de Caché', icon: Trash2 },
          { id: 'privacy', label: 'Privacidad & Telemetría', icon: Shield },
          { id: 'performance', label: 'Rendimiento Visual', icon: Gauge },
          { id: 'startup', label: 'Apps de Arranque', icon: Power }
        ].map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition ${
                active
                  ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Contenido Pestañas */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* PESTAÑA 1: LIMPIEZA */}
        {activeTab === 'clean' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PanelCard className="p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Archivos Residuales y Caché del Sistema
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Elimina archivos temporales acumulados sin afectar tus documentos ni configuraciones.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void refreshCleaningScan()}
                  className="icon-btn"
                  title="Volver a escanear"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="mt-4 space-y-2.5">
                {cleanItems.length === 0 && loading ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] p-6 text-xs text-[var(--text-muted)]">
                    <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                    Calculando espacio recuperable en carpetas temporales...
                  </div>
                ) : (
                  cleanItems.map((item) => {
                    const isChecked = selectedCleanIds.includes(item.id)
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 transition hover:bg-[var(--bg-card-hover)]"
                      >
                        <div className="flex items-center gap-3">
                          <Trash2 className="h-4 w-4 text-[var(--text-muted)]" />
                          <div>
                            <p className="text-xs font-medium text-[var(--text-primary)]">{item.name}</p>
                            <p className="text-[11px] text-[var(--text-muted)]">{item.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-semibold text-emerald-400">
                            {formatBytes(item.sizeBytes)}
                          </span>
                          <Switch
                            checked={isChecked}
                            accent="emerald"
                            onChange={(v) => {
                              if (v) setSelectedCleanIds((prev) => [...prev, item.id])
                              else setSelectedCleanIds((prev) => prev.filter((id) => id !== item.id))
                            }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </PanelCard>

            <PanelCard className="flex flex-col justify-between p-5">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Resumen de Espacio</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Espacio recuperable estimado en el disco principal.
                </p>

                <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 text-center">
                  <p className="text-3xl font-extrabold text-emerald-400">{formatBytes(totalCleanBytes)}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">Espacio seleccionado</p>
                </div>
              </div>

              <button
                type="button"
                disabled={loading || selectedCleanIds.length === 0}
                onClick={() => void handleExecuteClean()}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" /> Ejecutar Limpieza Ahora
              </button>
            </PanelCard>
          </div>
        )}

        {/* PESTAÑA 2: PRIVACIDAD Y TELEMETRÍA */}
        {activeTab === 'privacy' && (
          <PanelCard className="space-y-4 p-5">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Protección de Privacidad y Telemetría de Windows
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Deshabilita servicios de rastreo y recolección de diagnósticos en segundo plano.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    Desactivar DiagTrack (Connected User Experiences and Telemetry)
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Detiene el envío periódico de registros de telemetría a los servidores de Microsoft.
                  </p>
                </div>
                <Switch
                  checked={privacy.disableDiagTrack}
                  accent="emerald"
                  onChange={(v) => handleApplyPrivacy({ ...privacy, disableDiagTrack: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    Desactivar Identificador de Publicidad (Advertising ID)
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Evita que las aplicaciones creen un perfil publicitario basado en tus actividades.
                  </p>
                </div>
                <Switch
                  checked={privacy.disableAdvertisingId}
                  accent="emerald"
                  onChange={(v) => handleApplyPrivacy({ ...privacy, disableAdvertisingId: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    Desactivar Solicitudes de Comentarios (Feedback Frequency)
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Evita que Windows muestre ventanas emergentes preguntando por tu experiencia.
                  </p>
                </div>
                <Switch
                  checked={privacy.disableFeedback}
                  accent="emerald"
                  onChange={(v) => handleApplyPrivacy({ ...privacy, disableFeedback: v })}
                />
              </div>
            </div>
          </PanelCard>
        )}

        {/* PESTAÑA 3: RENDIMIENTO VISUAL */}
        {activeTab === 'performance' && (
          <PanelCard className="space-y-4 p-5">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Aceleración de Interfaz y Fluidez Visual
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Minimiza el lag eliminando animaciones pesadas y efectos de composición innecesarios.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    Desactivar Animaciones de Ventanas (Minimizar / Maximizar)
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Apertura y cierre instantáneo de aplicaciones sin transición lenta.
                  </p>
                </div>
                <Switch
                  checked={visual.disableWindowAnimations}
                  accent="emerald"
                  onChange={(v) => handleApplyVisual({ ...visual, disableWindowAnimations: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    Desactivar Transparencias de Windows
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Reduce la carga de la GPU al no tener que calcular el desenfoque de fondo.
                  </p>
                </div>
                <Switch
                  checked={visual.disableTransparency}
                  accent="emerald"
                  onChange={(v) => handleApplyVisual({ ...visual, disableTransparency: v })}
                />
              </div>
            </div>
          </PanelCard>
        )}

        {/* PESTAÑA 4: APLICACIONES DE ARRANQUE */}
        {activeTab === 'startup' && (
          <PanelCard className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Programas de Inicio Automático
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Deshabilita programas que se ejecutan automáticamente al encender el PC.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshStartup()}
                className="icon-btn"
                title="Actualizar lista"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {startupApps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-6 text-center text-xs text-[var(--text-muted)]">
                  No se encontraron aplicaciones de inicio adicionales en el registro.
                </div>
              ) : (
                startupApps.map((app) => (
                  <div
                    key={`${app.location}-${app.id}`}
                    className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{app.name}</p>
                        <span className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                          {app.location}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]" title={app.command}>
                        {app.command}
                      </p>
                    </div>

                    <Switch
                      checked={app.enabled}
                      accent="emerald"
                      onChange={(next) => void handleToggleStartup(app, next)}
                    />
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        )}
      </div>

      <GlobalToast message={toast?.msg ?? null} type={toast?.type ?? 'info'} />
    </div>
  )
}

