import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, LayoutGrid, Minus, Settings, Square, X } from 'lucide-react'
import type {
  BrandingConfig,
  DependencyStatus,
  HubAppSettings,
  ModuleStateSnapshot,
  NotificationSettings
} from '@panel/core-sdk'
import {
  GlobalToast,
  I18nProvider,
  ThemeProvider,
  ThemeToggle,
  formatMessage,
  useI18n
} from '@panel/ui-kit'
import { MODULE_REGISTRY, getModuleById } from './registry'
import { getHubApi } from './lib/hubApi'
import { buildBrandingPayload } from './lib/iconGenerator'
import { DashboardView } from './views/Dashboard'
import { SettingsView } from './views/Settings'
import { ModuleHost } from './components/ModuleHost'
import { ModuleTab } from './components/ModuleTab'
import { ActivityToast, type ActivityToastData } from './components/ActivityToast'
import { ensureNotificationPermission, sendNativeNotification } from './lib/notifications'
import {
  markSeen,
  resetActivity,
  subscribeTransitions,
  useActivities
} from './state/activityStore'

type ActiveRoute = 'dashboard' | 'settings' | string

const DEFAULT_NOTIFICATIONS: NotificationSettings = { enabled: true, onlyWhenUnfocused: true }

const DEFAULT_SETTINGS: HubAppSettings = {
  closeToTray: true,
  notifications: DEFAULT_NOTIFICATIONS,
  branding: {
    mode: 'logo',
    initials: 'PA',
    color: '#8b5cf6'
  }
}

function HubShell(): JSX.Element {
  const { t } = useI18n()
  const hubApi = useMemo(() => getHubApi(), [])
  const [route, setRoute] = useState<ActiveRoute>('dashboard')
  const [moduleStates, setModuleStates] = useState<Record<string, ModuleStateSnapshot>>({})
  const [appSettings, setAppSettings] = useState<HubAppSettings>(DEFAULT_SETTINGS)
  const [toast, setToast] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const toastTimer = useRef<number>()
  const prevModuleRef = useRef<string | null>(null)

  const handleToggleMaximize = useCallback(async () => {
    hubApi.maximizeWindow()
    if (hubApi.isWindowMaximized) {
      setTimeout(async () => {
        const next = await hubApi.isWindowMaximized?.()
        setIsMaximized(Boolean(next))
      }, 50)
    }
  }, [hubApi])

  useEffect(() => {
    hubApi.isWindowMaximized?.().then((max) => setIsMaximized(Boolean(max))).catch(() => {})
    const handleResize = () => {
      hubApi.isWindowMaximized?.().then((max) => setIsMaximized(Boolean(max))).catch(() => {})
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [hubApi])

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
      const normalizedMode = cfg.branding?.mode === 'initials' ? 'initials' : 'logo'
      const resolved: HubAppSettings = {
        ...cfg,
        notifications: cfg.notifications ?? DEFAULT_NOTIFICATIONS,
        branding: {
          ...cfg.branding,
          mode: normalizedMode
        }
      }
      setAppSettings(resolved)
      if (resolved.branding.mode === 'initials' && !resolved.branding.dataUrl) {
        const rebuilt = buildBrandingPayload('initials', resolved.branding.initials, resolved.branding.color)
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

  // Módulos visitados permanecen montados (keep-alive) para conservar su sesión
  const [mountedIds, setMountedIds] = useState<string[]>([])
  const activities = useActivities()

  const unmountModule = useCallback((moduleId: string) => {
    setMountedIds((prev) => {
      if (!prev.includes(moduleId)) return prev
      void getModuleById(moduleId)?.onStop?.()
      return prev.filter((id) => id !== moduleId)
    })
    resetActivity(moduleId)
  }, [])

  useEffect(() => {
    const manifest = route !== 'dashboard' && route !== 'settings' ? getModuleById(route) : undefined
    if (!manifest) return
    markSeen(manifest.id)
    setMountedIds((prev) => {
      if (prev.includes(manifest.id)) return prev
      void manifest.onStart?.()
      return [...prev, manifest.id]
    })
  }, [route])

  // Terminar mientras se está en la pestaña también cuenta como "visto"
  useEffect(() => {
    if (route !== 'dashboard' && route !== 'settings' && activities[route]?.unseen) markSeen(route)
  }, [route, activities])

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

  const handleUpdateNotifications = useCallback(
    async (notifications: NotificationSettings) => {
      if (notifications.enabled && !appSettings.notifications.enabled) {
        await ensureNotificationPermission()
      }
      const next = await hubApi.setNotifications(notifications)
      setAppSettings(next)
    },
    [hubApi, appSettings.notifications.enabled]
  )

  const handleToggleModule = useCallback(
    async (moduleId: string, enabled: boolean) => {
      const snap = await hubApi.setModuleEnabled(moduleId, enabled)
      setModuleStates((prev) => ({ ...prev, [moduleId]: snap }))
      const mod = getModuleById(moduleId)
      if (!enabled) {
        unmountModule(moduleId)
        if (route === moduleId) setRoute('dashboard')
      }
      notify(
        `${mod?.name ?? moduleId}: ${
          enabled ? 'Módulo habilitado' : 'Módulo desactivado y recursos liberados'
        }`
      )
    },
    [hubApi, route, notify, unmountModule]
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
      unmountModule(moduleId)
      notify('Subprocesos del módulo detenidos')
    },
    [hubApi, notify, unmountModule]
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

  // ── Notificaciones al terminar una tarea ─────────────────────────────
  const routeRef = useRef(route)
  routeRef.current = route
  const notifRef = useRef({ settings: appSettings.notifications, t })
  notifRef.current = { settings: appSettings.notifications, t }
  const [activityToast, setActivityToast] = useState<ActivityToastData | null>(null)
  const activityToastTimer = useRef<number>()

  useEffect(() => {
    const unsub = subscribeTransitions(async (tr) => {
      const { settings, t: tt } = notifRef.current
      if (!settings.enabled) return
      const focused = (await hubApi.isWindowFocused?.()) ?? true
      const viewing = routeRef.current === tr.moduleId
      // Módulo en pantalla y ventana en primer plano: el propio módulo ya da feedback
      if (focused && viewing) return

      const name = tt.modules[tr.moduleId as keyof typeof tt.modules]?.shortName ?? tr.moduleId
      const ok = tr.status === 'success'
      let body = formatMessage(ok ? tt.activity.doneBody : tt.activity.failedBody, { name })
      if (!ok && tr.message) body = `${body} ${tr.message}`

      if (!focused) {
        void sendNativeNotification(name, body)
      } else if (!settings.onlyWhenUnfocused || !viewing) {
        window.clearTimeout(activityToastTimer.current)
        setActivityToast({ moduleId: tr.moduleId, status: tr.status, title: name, body })
        activityToastTimer.current = window.setTimeout(() => setActivityToast(null), 6000)
      }
    })
    return () => {
      unsub()
      window.clearTimeout(activityToastTimer.current)
    }
  }, [hubApi])

  // Progreso agregado en la barra de tareas de Windows
  useEffect(() => {
    const running = Object.values(activities).filter((a) => a.status === 'running')
    if (running.length === 0) {
      hubApi.setTaskbarProgress?.(null)
      return
    }
    const determinate = running.filter((a) => typeof a.progress === 'number')
    hubApi.setTaskbarProgress?.(
      determinate.length === 0
        ? -1
        : determinate.reduce((sum, a) => sum + (a.progress as number), 0) / determinate.length
    )
  }, [activities, hubApi])

  // Menú de la bandeja traducido al idioma activo
  useEffect(() => {
    hubApi.setTrayLabels({
      header: t.tray.header,
      dashboard: t.tray.dashboard,
      video: t.modules['mod-video'].name,
      scanner: t.modules['mod-scanner'].name,
      optimizer: t.modules['mod-optimizer'].name,
      pdf: t.modules['mod-pdf'].name,
      settings: t.tray.settings,
      keepBackground: t.tray.keepBackground,
      quit: t.tray.quit,
      tooltip: t.tray.tooltip
    })
  }, [hubApi, t])

  // running/statusText provienen del registro de actividad (única fuente de verdad)
  const effectiveStates = useMemo(() => {
    const merged: Record<string, ModuleStateSnapshot> = {}
    for (const [id, snap] of Object.entries(moduleStates)) {
      const act = activities[id]
      const running = act?.status === 'running'
      merged[id] = running
        ? { ...snap, running: true, statusText: act?.label ?? t.activity.running, progress: act?.progress ?? null }
        : { ...snap, running: false }
    }
    return merged
  }, [moduleStates, activities, t])

  return (
    <div className="hub-bg flex h-full flex-col overflow-hidden text-[var(--text-primary)]">
      {/* Barra superior (Titlebar personalizada + Navegación rápida estilo Raycast / PowerToys) */}
      <header
        data-tauri-drag-region
        className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-3.5 pr-2 backdrop-blur-xl select-none"
      >
        {/* Identidad del Hub (LogoAlbedo o Iniciales dinámicas) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRoute('dashboard')}
            className="app-no-drag flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-[var(--bg-card-hover)]"
            title={t.nav.goToHome}
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
              {t.common.appTitle}
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
              {t.nav.home}
            </button>

            {enabledModules.map((mod) => (
              <ModuleTab
                key={mod.id}
                module={mod}
                selected={route === mod.id}
                activity={activities[mod.id]}
                onSelect={() => setRoute(mod.id)}
              />
            ))}
          </nav>
        </div>

        {/* Acciones derechas: Toggle de tema rápido + Configuración + Botones de Control de Ventana */}
        <div className="app-no-drag flex items-center gap-1.5">
          <ThemeToggle compact />

          <button
            type="button"
            onClick={() => setRoute('settings')}
            title={t.settings.title}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${
              route === 'settings'
                ? 'border-violet-500/40 bg-violet-500/15 text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t.nav.settings}</span>
          </button>

          <span className="mx-1 h-4 w-px bg-[var(--border-subtle)]" />

          {/* Botones de Control de Ventana Propios (Frameless Window) */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => hubApi.minimizeWindow()}
              className="inline-flex h-7 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              title={t.common.minimize}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              className="inline-flex h-7 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              title={isMaximized ? t.common.restore : t.common.maximize}
            >
              {isMaximized ? (
                <Copy className="h-3 w-3" />
              ) : (
                <Square className="h-3 w-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => hubApi.closeWindow()}
              className="inline-flex h-7 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-rose-600 hover:text-white"
              title={t.common.close}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenedor Principal con Lazy Loading Total */}
      <div className="min-h-0 flex-1 p-4">
        {route === 'dashboard' && (
          <DashboardView
            modules={orderedModules}
            moduleStates={effectiveStates}
            onOpenModule={(id) => setRoute(id)}
            onToggleModule={(id, enabled) => void handleToggleModule(id, enabled)}
            onOpenSettings={() => setRoute('settings')}
            onReorderModules={handleReorderModules}
          />
        )}

        {route === 'settings' && (
          <SettingsView
            modules={orderedModules}
            moduleStates={effectiveStates}
            appSettings={appSettings}
            onUpdateBranding={handleUpdateBranding}
            onUpdateCloseToTray={handleUpdateCloseToTray}
            onUpdateNotifications={handleUpdateNotifications}
            onToggleModule={(id, enabled) => void handleToggleModule(id, enabled)}
            onCheckDependencies={handleCheckDeps}
            onStopProcesses={handleStopProcesses}
          />
        )}

        {mountedIds.map((id) => {
          const manifest = getModuleById(id)
          if (!manifest) return null
          return (
            <ModuleHost
              key={id}
              manifest={manifest}
              isActive={route === id}
              onNavigateHome={handleNavigateHome}
            />
          )
        })}
      </div>

      <ActivityToast
        toast={activityToast}
        viewLabel={t.activity.view}
        onView={(id) => {
          setActivityToast(null)
          setRoute(id)
        }}
      />
      <GlobalToast message={toast} type="info" />
    </div>
  )
}

export default function App(): JSX.Element {
  const hubApi = useMemo(() => getHubApi(), [])

  return (
    <I18nProvider>
      <ThemeProvider onResolvedChange={(resolved) => hubApi.setNativeTheme(resolved)}>
        <HubShell />
      </ThemeProvider>
    </I18nProvider>
  )
}
