/// <reference types="vite/client" />

declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  const worker: unknown
  export default worker
}

declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
    options?: unknown
  ): Promise<T>
  export function convertFileSrc(filePath: string, protocol?: string): string
}

declare module '@tauri-apps/api/event' {
  export type UnlistenFn = () => void
  export interface Event<T> {
    event: string
    id: number
    payload: T
  }
  export type EventCallback<T> = (event: Event<T>) => void
  export function listen<T = unknown>(
    event: string,
    handler: EventCallback<T>,
    options?: unknown
  ): Promise<UnlistenFn>
  export function emit(event: string, payload?: unknown): Promise<void>
}
