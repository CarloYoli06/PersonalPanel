import { Suspense, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ModuleManifest } from '@panel/core-sdk'
import { formatMessage, useI18n } from '@panel/ui-kit'
import { getReporter } from '../state/activityStore'
import { ModuleErrorBoundary } from './ModuleErrorBoundary'

interface ModuleHostProps {
  manifest: ModuleManifest
  isActive: boolean
  onNavigateHome: () => void
}

/**
 * Contenedor de un módulo ya visitado. Permanece montado aunque la pestaña esté oculta
 * para conservar su sesión (estado, listeners y tareas en curso).
 */
export function ModuleHost({ manifest, isActive, onNavigateHome }: ModuleHostProps): JSX.Element {
  const { t } = useI18n()
  const [attempt, setAttempt] = useState(0)
  const name = t.modules[manifest.id as keyof typeof t.modules]?.shortName ?? manifest.name

  return (
    <div className="h-full" hidden={!isActive}>
      <ModuleErrorBoundary
        key={attempt}
        title={formatMessage(t.activity.moduleCrashed, { name })}
        retryLabel={t.activity.retry}
        onRetry={() => setAttempt((n) => n + 1)}
      >
        <Suspense
          fallback={
            <div className="panel flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {formatMessage(t.activity.loading, { name })}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{t.activity.lazyHint}</p>
            </div>
          }
        >
          <manifest.entryPoint
            isActive={isActive}
            activity={getReporter(manifest.id)}
            onNavigateHome={onNavigateHome}
          />
        </Suspense>
      </ModuleErrorBoundary>
    </div>
  )
}
