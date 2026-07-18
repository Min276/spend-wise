import type { AppData } from './types.ts'
import type { AlertEvent } from './alerts.ts'

export const canNotify = () => 'Notification' in window
export const hasPermission = () => canNotify() && Notification.permission === 'granted'

export async function requestPermission(): Promise<boolean> {
  if (!canNotify()) return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export async function showNotification(title: string, body: string, route = '/', tag?: string) {
  if (!hasPermission()) return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg)
      await reg.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { route },
      })
    else new Notification(title, { body, tag, icon: '/icons/icon-192.png' })
  } catch {
    // notifications unavailable — in-app alerts already cover this
  }
}

export function notifyAlert(data: AppData, e: AlertEvent) {
  if (!data.settings.thresholdNotifs) return
  void showNotification(e.title, e.body, e.route, e.key)
}
