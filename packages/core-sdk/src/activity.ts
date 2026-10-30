export type ActivityStatus = 'idle' | 'running' | 'success' | 'error'

export interface ModuleActivity {
  status: ActivityStatus
  /** 0-100, o null/undefined si es indeterminado */
  progress?: number | null
  label?: string
  message?: string
  startedAt?: number
  finishedAt?: number
  /** true cuando terminó (success/error) y el usuario aún no visitó la pestaña */
  unseen: boolean
}

export const IDLE_ACTIVITY: ModuleActivity = { status: 'idle', unseen: false }

/**
 * API que cada módulo usa para reportar su actividad al Hub.
 * El Hub es la única fuente de verdad: pestañas, Dashboard y notificaciones leen de aquí.
 */
export interface ActivityReporter {
  start(label?: string): void
  progress(pct: number | null, label?: string): void
  succeed(message?: string): void
  fail(message?: string): void
  /** Envuelve una operación async: start + succeed/fail automáticos */
  track<T>(
    label: string,
    fn: () => Promise<T>,
    opts?: { successMessage?: (result: T) => string | undefined }
  ): Promise<T>
}
