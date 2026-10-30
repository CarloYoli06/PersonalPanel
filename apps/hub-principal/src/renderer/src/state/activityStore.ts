import { useSyncExternalStore } from 'react'
import { IDLE_ACTIVITY, type ActivityReporter, type ModuleActivity } from '@panel/core-sdk'

export interface ActivityTransition {
  moduleId: string
  status: 'success' | 'error'
  message?: string
  label?: string
}

type Listener = () => void

let activities: Record<string, ModuleActivity> = {}
const counters = new Map<string, number>()
const reporters = new Map<string, ActivityReporter>()
const listeners = new Set<Listener>()
const transitionListeners = new Set<(t: ActivityTransition) => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

function patch(id: string, next: Partial<ModuleActivity>): void {
  activities = { ...activities, [id]: { ...(activities[id] ?? IDLE_ACTIVITY), ...next } }
  emit()
}

function begin(id: string, label?: string): void {
  counters.set(id, (counters.get(id) ?? 0) + 1)
  const prev = activities[id]
  patch(id, {
    status: 'running',
    label: label ?? prev?.label,
    message: undefined,
    progress: prev?.status === 'running' ? prev.progress : null,
    startedAt: prev?.status === 'running' ? prev.startedAt : Date.now(),
    finishedAt: undefined,
    unseen: false
  })
}

function finish(id: string, status: 'success' | 'error', message?: string): void {
  const remaining = Math.max(0, (counters.get(id) ?? 1) - 1)
  counters.set(id, remaining)
  const prev = activities[id]
  // Un error en cualquier tarea concurrente prevalece hasta que todas terminen
  if (remaining > 0 && status === 'success') return
  if (remaining > 0) {
    patch(id, { message })
    return
  }
  patch(id, {
    status,
    message,
    progress: status === 'success' ? 100 : prev?.progress,
    finishedAt: Date.now(),
    unseen: true
  })
  transitionListeners.forEach((l) => l({ moduleId: id, status, message, label: prev?.label }))
}

function createReporter(id: string): ActivityReporter {
  return {
    start: (label) => begin(id, label),
    progress: (pct, label) => {
      if (activities[id]?.status !== 'running') return
      patch(id, { progress: pct, ...(label ? { label } : {}) })
    },
    succeed: (message) => finish(id, 'success', message),
    fail: (message) => finish(id, 'error', message),
    async track(label, fn, opts) {
      begin(id, label)
      try {
        const result = await fn()
        finish(id, 'success', opts?.successMessage?.(result))
        return result
      } catch (err) {
        finish(id, 'error', err instanceof Error ? err.message : String(err))
        throw err
      }
    }
  }
}

/** Reporter estable por módulo: nunca depende de cuál pestaña está activa. */
export function getReporter(moduleId: string): ActivityReporter {
  let r = reporters.get(moduleId)
  if (!r) {
    r = createReporter(moduleId)
    reporters.set(moduleId, r)
  }
  return r
}

export function markSeen(moduleId: string): void {
  const cur = activities[moduleId]
  if (!cur?.unseen) return
  patch(moduleId, { unseen: false })
}

/** Descarta el estado de un módulo (al cerrar sesión, deshabilitar o detener procesos). */
export function resetActivity(moduleId: string): void {
  counters.set(moduleId, 0)
  patch(moduleId, { ...IDLE_ACTIVITY })
}

export function subscribeTransitions(cb: (t: ActivityTransition) => void): () => void {
  transitionListeners.add(cb)
  return () => transitionListeners.delete(cb)
}

function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

const getSnapshot = (): Record<string, ModuleActivity> => activities

export function useActivities(): Record<string, ModuleActivity> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
