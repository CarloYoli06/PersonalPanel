import { isTauriRuntime } from './hubApi'

/**
 * Notificaciones nativas del SO. En Tauri usa tauri-plugin-notification;
 * en el navegador (modo mock) cae a la Web Notification API o a un no-op.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (isTauriRuntime()) {
      const { isPermissionGranted, requestPermission } = await import(
        '@tauri-apps/plugin-notification'
      )
      if (await isPermissionGranted()) return true
      return (await requestPermission()) === 'granted'
    }
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export async function sendNativeNotification(title: string, body: string): Promise<void> {
  try {
    if (!(await ensureNotificationPermission())) return
    if (isTauriRuntime()) {
      const { sendNotification } = await import('@tauri-apps/plugin-notification')
      sendNotification({ title, body })
    } else {
      new Notification(title, { body })
    }
  } catch (err) {
    console.warn('[notifications] No se pudo enviar la notificación', err)
  }
}
