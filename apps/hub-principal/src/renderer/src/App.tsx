import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard,
  FileText,
  LayoutGrid,
  Loader2,
  ScanLine,
  Settings,
  Sparkles,
  Wrench
} from 'lucide-react'
import type {
  BrandingConfig,
  DependencyStatus,
  HubAppSettings,
  ModuleManifest,
  ModuleStateSnapshot
} from '@panel/core-sdk'
import { GlobalToast, ThemeProvider, ThemeToggle } from '@panel/ui-kit'
import { MODULE_REGISTRY, getModuleById } from './registry'
import { getHubApi } from './lib/hubApi'
import { buildBrandingPayload } from './lib/iconGenerator'
import { DashboardView } from './views/Dashboard'
import { SettingsView } from './views/Settings'

type ActiveRoute = 'dashboard' | 'settings' | string

function NavIcon({ icon }: { icon: ModuleManifest['icon'] }): JSX.Element {
  if (icon === 'video') return <Clapperboard className="h-4 w-4" />
  if (icon === 'scan') return <ScanLine className="h-4 w-4" />
  if (icon === 'wrench') return <Wrench className="h-4 w-4" />
  if (icon === 'file-text') return <FileText className="h-4 w-4" />
  return <Sparkles className="h-4 w-4" />
}

const DEFAULT_SETTINGS: HubAppSettings = {
  closeToTray: true,
  branding: {
    mode: 'logo',
    initials: 'PA',
    color: '#8b5cf6'
  }
}

function HubShell(): JSX.Element {
  const hubApi = useMemo(() => getHubApi(), [])
  const [route, setRoute] = useState<ActiveRoute>('dashboard')
  const [moduleStates, setModuleStates] = useState<Record<string, ModuleStateSnapshot>>({})
  const [appSettings, setAppSettings] = useState<HubAppSettings>(DEFAULT_SETTINGS)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>()
  const prevModuleRef = useRef<string | null>(null)

  const notify = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  // Cargar estados iniciales, branding y suscribirse a eventos de System Tray
  useEffect(() => {
    let mounted = true
    hubApi.getModuleStates().then((states) => {
      if (mounted) setModuleStates(states)
    })

    hubApi.getAppSettings().then((cfg) => {
      if (!mounted) return
      setAppSettings(cfg)
      if (cfg.branding.mode === 'initials' && !cfg.branding.dataUrl) {
        const rebuilt = buildBrandingPayload('initials', cfg.branding.initials, cfg.branding.color)
        void hubApi.setBranding(rebuilt).then((updated) => {
          if (mounted) setAppSettings(updated)
        })
      }
    })

    const unsubState = hubApi.onModuleStateChange((snap) => {
      setModuleStates((prev) => ({ ...prev, [snap.id]: snap }))
    })

    const unsubTray = hubApi.onTrayNavigate((targetRoute) => {
      setRoute(targetRoute)
    })

    return () => {
      mounted = false
      unsubState()
      unsubTray()
      window.clearTimeout(toastTimer.current)
    }
  }, [hubApi])

  // Invocar hooks de ciclo de vida (`onStart` y `onStop`) del manifiesto al entrar/salir de un módulo
  useEffect(() => {
    const prevId = prevModuleRef.current
    const currentManifest =
      route !== 'dashboard' && route !== 'settings' ? getModuleById(route) : undefined

    if (prevId && prevId !== currentManifest?.id) {
      const prevManifest = getModuleById(prevId)
      void prevManifest?.onStop?.()
    }

    if (currentManifest && currentManifest.id !== prevId) {
      void currentManifest.onStart?.()
      prevModuleRef.current = currentManifest.id
    } else if (!currentManifest) {
      prevModuleRef.current = null
    }
  }, [route])

  const handleUpdateBranding = useCallback(
    async (branding: BrandingConfig) => {
      const next = await hubApi.setBranding(branding)
      setAppSettings(next)
      notify(
        branding.mode === 'logo'
          ? 'Icono actualizado al Logo Albedo'
          : `Icono actualizado a iniciales (${branding.initials})`
      )
    },
    [hubApi, notify]
  )

  const handleUpdateCloseToTray = useCallback(
    async (closeToTray: boolean) => {
      const next = await hubApi.setCloseToTray(closeToTray)
      setAppSettings(next)
      notify(
        closeToTray
          ? 'Activado: Al cerrar se minimizará a la bandeja del sistema'
          : 'Desactivado: Al cerrar finalizará la aplicación'
      )
    },
    [hubApi, notify]
  )

  const handleToggleModule = useCallback(
    async (moduleId: string, enabled: boolean) => {
      const snap = await hubApi.setModuleEnabled(moduleId, enabled)
      setModuleStates((prev) => ({ ...prev, [moduleId]: snap }))
      const mod = getModuleById(moduleId)
      if (!enabled && route === moduleId) {
        setRoute('dashboard')
      }
      notify(
        `${mod?.name ?? moduleId}: ${
          enabled ? 'Módulo habilitado' : 'Módulo desactivado y recursos liberados'
        }`
      )
    },
    [hubApi, route, notify]
  )

  const handleCheckDeps = useCallback(
    async (moduleId: string): Promise<DependencyStatus[]> => {
      const deps = await hubApi.checkModuleDependencies(moduleId)
      notify('Verificación de binarios completada')
      return deps
    },
    [hubApi, notify]
  )

  const handleStopProcesses = useCallback(
    async (moduleId: string): Promise<void> => {
      await hubApi.stopModuleProcesses(moduleId)
      notify('Subprocesos del módulo detenidos')
    },
    [hubApi, notify]
  )

  const handleModuleInlineStatus = useCallback(
    (moduleId: string, running: boolean, statusText?: string) => {
      setModuleStates((prev) => {
        const current = prev[moduleId]
        if (!current) return prev
        const nextStatusText = statusText ?? (running ? 'Procesando…' : 'Listo (0 MB en reposo)')
        if (current.running === running && current.statusText === nextStatusText) {
          return prev
        }
        return {
          ...prev,
          [moduleId]: {
            ...current,
            running,
            statusText: nextStatusText
          }
        }
      })
    },
    []
  )

  const handleNavigateHome = useCallback(() => setRoute('dashboard'), [])

  const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('panel-personal:module-order')
      if (saved) return JSON.parse(saved) as string[]
    } catch {
      /* ignore */
    }
    return MODULE_REGISTRY.map((m) => m.id)
  })

  const orderedModules = useMemo(() => {
    const map = new Map(MODULE_REGISTRY.map((m) => [m.id, m]))
    const result: typeof MODULE_REGISTRY[number][] = []
    for (const id of moduleOrder) {
      const mod = map.get(id)
      if (mod) {
        result.push(mod)
        map.delete(id)
      }
    }
    for (const mod of map.values()) {
      result.push(mod)
    }
    return result
  }, [moduleOrder])

  const handleReorderModules = useCallback((nextOrder: string[]) => {
    setModuleOrder(nextOrder)
    try {
      localStorage.setItem('panel-personal:module-order', JSON.stringify(nextOrder))
    } catch {
      /* ignore */
    }
  }, [])

  const enabledModules = useMemo(
    () => orderedModules.filter((m) => moduleStates[m.id]?.enabled !== false),
    [orderedModules, moduleStates]
  )

  const activeModule = useMemo(
    () => (route !== 'dashboard' && route !== 'settings' ? getModuleById(route) : undefined),
    [route]
  )

  const handleActiveModuleStatusChange = useCallback(
    (running: boolean, text?: string) => {
      if (activeModule) {
        handleModuleInlineStatus(activeModule.id, running, text)
      }
    },
    [activeModule, handleModuleInlineStatus]
  )

  return (
    <div className="hub-bg flex h-full flex-col overflow-hidden text-[var(--text-primary)]">
      {/* Barra superior (Titlebar + Navegación rápida estilo Raycast / PowerToys) */}
      <header className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-3.5 pr-[145px] backdrop-blur-xl">
        {/* Identidad del Hub (LogoAlbedo o Iniciales dinámicas) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRoute('dashboard')}
            className="app-no-drag flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-[var(--bg-card-hover)]"
            title="Ir al Panel Principal"
          >
            {appSettings.branding.mode === 'initials' ? (
              <div
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-extrabold text-white shadow-md"
                style={{ backgroundColor: appSettings.branding.color }}
              >
                {appSettings.branding.initials}
              </div>
            ) : (
              <img
                src="./logo-albedo.png"
                alt="Logo Albedo"
                className="h-6 w-6 rounded-lg object-cover shadow-md"
              />
            )}
            <span className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
              Panel Personal
            </span>
          </button>

          <span className="h-4 w-px bg-[var(--border-subtle)]" />

          {/* Pestañas de navegación minimalista */}
          <nav className="app-no-drag flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRoute('dashboard')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                route === 'dashboard'
                  ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5 text-violet-400" />
              Inicio (Hub)
            </button>

            {enabledModules.map((mod) => {
              const isSelected = route === mod.id
              const isRunning = Boolean(moduleStates[mod.id]?.running)
              const activeRing =
                mod.accent === 'cyan'
                  ? 'bg-cyan-500/15 text-[var(--text-primary)] ring-1 ring-cyan-500/35'
                  : mod.accent === 'emerald'
                    ? 'bg-emerald-500/15 text-[var(--text-primary)] ring-1 ring-emerald-500/35'
                    : mod.accent === 'rose'
                      ? 'bg-rose-500/15 text-[var(--text-primary)] ring-1 ring-rose-500/35'
                      : 'bg-violet-500/15 text-[var(--text-primary)] ring-1 ring-violet-500/35'

              const iconColor =
                mod.accent === 'cyan'
                  ? 'text-cyan-400'
                  : mod.accent === 'emerald'
                    ? 'text-emerald-400'
                    : mod.accent === 'rose'
                      ? 'text-rose-400'
                      : 'text-violet-400'

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setRoute(mod.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    isSelected
                      ? activeRing
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={iconColor}>
                    <NavIcon icon={mod.icon} />
                  </span>
                  <span>{mod.name.split('·')[0].trim()}</span>
                  {isRunning && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Acciones derechas: Toggle de tema rápido + Configuración */}
        <div className="app-no-drag flex items-center gap-2">
          <ThemeToggle compact />

          <button
            type="button"
            onClick={() => setRoute('settings')}
            title="Configuración, Icono y Bandeja del Sistema"
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${
              route === 'settings'
                ? 'border-violet-500/40 bg-violet-500/15 text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Ajustes</span>
          </button>
        </div>
      </header>

      {/* Contenedor Principal con Lazy Loading Total */}
      <div className="min-h-0 flex-1 p-4">
        {route === 'dashboard' && (
          <DashboardView
            modules={orderedModules}
            moduleStates={moduleStates}
            onOpenModule={(id) => setRoute(id)}
            onToggleModule={(id, enabled) => void handleToggleModule(id, enabled)}
            onOpenSettings={() => setRoute('settings')}
            onReorderModules={handleReorderModules}
          />
        )}

        {route === 'settings' && (
          <SettingsView
            modules={orderedModules}
            moduleStates={moduleStates}
            appSettings={appSettings}
            onUpdateBranding={handleUpdateBranding}
            onUpdateCloseToTray={handleUpdateCloseToTray}
            onToggleModule={(id, enabled) => void handleToggleModule(id, enabled)}
            onCheckDependencies={handleCheckDeps}
            onStopProcesses={handleStopProcesses}
          />
        )}

        {activeModule && (
          <Suspense
            fallback={
              <div className="panel flex h-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Cargando módulo {activeModule.name} en memoria…
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Inicializando interfaz bajo demanda (Lazy Loading)
                </p>
              </div>
            }
          >
            <activeModule.entryPoint
              onNavigateHome={handleNavigateHome}
              onStatusChange={handleActiveModuleStatusChange}
            />
          </Suspense>
        )}
      </div>

      <GlobalToast message={toast} type="info" />
    </div>
  )
}

export default function App(): JSX.Element {
  const hubApi = useMemo(() => getHubApi(), [])

  return (
    <ThemeProvider onResolvedChange={(resolved) => hubApi.setNativeTheme(resolved)}>
      <HubShell />
    </ThemeProvider>
  )
}
