import { useState } from 'react'
import {
  Check,
  CheckCircle2,
  Cpu,
  Globe,
  HardDriveDownload,
  Image as ImageIcon,
  MonitorDown,
  Palette,
  Power,
  RefreshCw,
  ShieldAlert,
  Square,
  Type
} from 'lucide-react'
import type {
  BrandingConfig,
  DependencyStatus,
  HubAppSettings,
  ModuleManifest,
  ModuleStateSnapshot
} from '@panel/core-sdk'
import {
  StatusBadge,
  Switch,
  ThemeToggle,
  useI18n,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type LanguageOption
} from '@panel/ui-kit'
import { BRANDING_PRESET_COLORS, buildBrandingPayload } from '../lib/iconGenerator'

interface SettingsViewProps {
  modules: readonly ModuleManifest[]
  moduleStates: Record<string, ModuleStateSnapshot>
  appSettings: HubAppSettings
  onUpdateBranding: (branding: BrandingConfig) => Promise<void>
  onUpdateCloseToTray: (closeToTray: boolean) => Promise<void>
  onToggleModule: (moduleId: string, enabled: boolean) => void
  onCheckDependencies: (moduleId: string) => Promise<DependencyStatus[]>
  onStopProcesses: (moduleId: string) => Promise<void>
}

export function SettingsView({
  modules,
  moduleStates,
  appSettings,
  onUpdateBranding,
  onUpdateCloseToTray,
  onToggleModule,
  onCheckDependencies,
  onStopProcesses
}: SettingsViewProps): JSX.Element {
  const { t, language, setLanguage } = useI18n()
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [initialsInput, setInitialsInput] = useState<string>(appSettings.branding.initials || 'PA')
  const [selectedColor, setSelectedColor] = useState<string>(
    appSettings.branding.color || '#8b5cf6'
  )

  const handleVerify = async (moduleId: string): Promise<void> => {
    setCheckingId(moduleId)
    try {
      await onCheckDependencies(moduleId)
    } finally {
      setCheckingId(null)
    }
  }

  const handleSelectMode = (mode: 'logo' | 'initials'): void => {
    const payload = buildBrandingPayload(mode, initialsInput, selectedColor)
    void onUpdateBranding(payload)
  }

  const handleApplyInitials = (nextInitials: string, nextColor: string): void => {
    setInitialsInput(nextInitials)
    setSelectedColor(nextColor)
    const payload = buildBrandingPayload('initials', nextInitials, nextColor)
    void onUpdateBranding(payload)
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      {/* Sección 1: Selector de Idioma y Tema */}
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {t.settings.languageSectionTitle}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t.settings.languageSectionDesc}
              </p>
            </div>
          </div>

          <ThemeToggle />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUPPORTED_LANGUAGES.map((lang: LanguageOption) => {
            const active = language === lang.code
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLanguage(lang.code)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-violet-500/60 bg-violet-500/15 text-[var(--text-primary)] shadow-sm ring-1 ring-violet-500/30'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="text-2xl leading-none">{lang.flag}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight">{lang.nativeName}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{lang.label}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Sección 2: Identidad del Icono / Logo (LogoAlbedo vs Iniciales + Color) y Bandeja de Sistema */}
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {t.settings.brandingSectionTitle}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t.settings.brandingSectionDesc}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Selector de Icono: Logo Original vs Iniciales */}
          <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <p className="section-label !mb-1">{t.settings.brandingSectionTitle}</p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectMode('logo')}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  appSettings.branding.mode === 'logo'
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <img
                  src="./logo-albedo.png"
                  alt="Logo Albedo"
                  className="h-10 w-10 shrink-0 rounded-xl object-cover shadow"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {t.settings.logoOptionTitle}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {t.settings.logoOptionDesc}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('initials')}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  appSettings.branding.mode === 'initials'
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white shadow"
                  style={{ backgroundColor: selectedColor }}
                >
                  {(initialsInput.trim().slice(0, 2) || 'P').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {t.settings.initialsOptionTitle}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {t.settings.initialsOptionDesc}
                  </p>
                </div>
              </button>
            </div>

            {/* Controles de Iniciales y Color */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <div className="w-28">
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)]">
                    <Type className="h-3 w-3" /> {t.settings.initialsInputLabel}
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={initialsInput}
                    onChange={(e) =>
                      handleApplyInitials(e.target.value.toUpperCase(), selectedColor)
                    }
                    placeholder="PA"
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-center font-mono text-sm font-bold uppercase text-[var(--text-primary)] outline-none focus:border-violet-400"
                  />
                </div>

                <div className="flex-1">
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)]">
                    <Palette className="h-3 w-3" /> {t.settings.bgColorLabel}
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BRANDING_PRESET_COLORS.map((c) => {
                      const active = selectedColor.toLowerCase() === c.hex.toLowerCase()
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.label}
                          onClick={() => handleApplyInitials(initialsInput, c.hex)}
                          className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-offset-1 ring-offset-[var(--bg-base)] transition hover:scale-110"
                          style={{
                            backgroundColor: c.hex,
                            borderColor: active ? '#ffffff' : 'transparent'
                          }}
                        >
                          {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </button>
                      )
                    })}
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => handleApplyInitials(initialsInput, e.target.value)}
                      title="Elegir color personalizado"
                      className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Comportamiento en Segundo Plano (Bandeja del Sistema / System Tray) */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <div>
              <p className="section-label !mb-1">{t.settings.traySectionTitle}</p>
              <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
                <div className="flex items-start gap-3">
                  <MonitorDown className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" />
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {t.settings.traySectionTitle}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                      {t.settings.traySectionDesc}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={appSettings.closeToTray}
                  accent="cyan"
                  onChange={(next) => void onUpdateCloseToTray(next)}
                />
              </div>
            </div>

            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              💡 {t.settings.trayTip}
            </p>
          </div>
        </div>
      </section>

      {/* Sección 3: Gestión Modular y Binarios Externos */}
      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30">
              <Power className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {t.settings.modulesSectionTitle}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t.settings.modulesSectionDesc}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {modules.map((mod) => {
            const st = moduleStates[mod.id]
            const enabled = st ? st.enabled : mod.defaultEnabled
            const running = Boolean(st?.running)
            const deps = st?.dependencies ?? []
            const isChecking = checkingId === mod.id

            return (
              <div
                key={mod.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {t.modules[mod.id as keyof typeof t.modules]?.name || mod.name}
                      </h3>
                      <span className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                        {mod.id}
                      </span>
                      <StatusBadge
                        status={!enabled ? 'disabled' : running ? 'running' : 'ready'}
                        label={
                          !enabled
                            ? t.common.disabled
                            : running
                              ? st?.statusText || t.common.runningSubprocess
                              : t.common.ready
                        }
                      />
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {t.modules[mod.id as keyof typeof t.modules]?.description || mod.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {running && (
                      <button
                        type="button"
                        onClick={() => void onStopProcesses(mod.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-400 ring-1 ring-rose-500/30 hover:bg-rose-500/25"
                      >
                        <Square className="h-3 w-3 fill-current" /> {t.settings.stopProcesses}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isChecking}
                      onClick={() => void handleVerify(mod.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                      {isChecking ? t.settings.checking : t.settings.checkDeps}
                    </button>

                    <div className="flex items-center gap-2 pl-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {enabled ? t.common.active : t.common.disabled}
                      </span>
                      <Switch
                        checked={enabled}
                        accent={mod.accent}
                        onChange={(next) => onToggleModule(mod.id, next)}
                      />
                    </div>
                  </div>
                </div>

                {/* Lista de binarios / dependencias verificadas */}
                <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {t.settings.binariesHeader} ({mod.externalBinaries.length})
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                      <HardDriveDownload className="h-3 w-3" /> {t.settings.appDataDownload}
                    </span>
                  </div>

                  {deps.length === 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mod.externalBinaries.map((bin) => (
                        <span
                          key={bin}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-secondary)]"
                        >
                          <Cpu className="h-3 w-3 text-violet-400" /> {bin}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {deps.map((dep) => (
                        <div
                          key={dep.name}
                          className="flex items-start justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                              {dep.ready ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                              ) : (
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                              )}
                              <span className="truncate">{dep.name}</span>
                              {dep.version && (
                                <span className="rounded bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                                  {dep.version}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                              {dep.description}
                            </p>
                            {dep.binaryPath && (
                              <p
                                className="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]"
                                title={dep.binaryPath}
                              >
                                {dep.binaryPath}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
