import type { AppData, ReminderSetting, ReminderId } from './types.ts'
import type { AlertEvent } from './alerts.ts'
import { buildReminder, dueReminders, localClock, reminderKey } from './reminders.ts'
import { getSupabase } from './supabase.ts'

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
    // notifications unavailable on this platform
  }
}

export function notifyAlert(data: AppData, e: AlertEvent) {
  if (!data.settings.thresholdNotifs) return
  void showNotification(e.title, e.body, e.route, e.key)
}

/* ---------- web push (fires even when the app is closed) ---------- */

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok'

export const pushSupported = () =>
  !!VAPID_PUBLIC && canNotify() && 'serviceWorker' in navigator && 'PushManager' in window

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

function toUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Mirrors this device's subscription + schedule to the server row the push
// tick reads. The row holds only endpoint/keys/timezone/times — never ledger data.
export async function syncPushSchedule(
  userId: string,
  reminders: Record<ReminderId, ReminderSetting>,
  sub?: PushSubscription | null,
): Promise<void> {
  const s = sub ?? (await getPushSubscription())
  const sb = await getSupabase()
  if (!s || !sb) return
  const json = s.toJSON()
  const { error } = await sb.from('push_subscriptions').upsert(
    {
      endpoint: s.endpoint,
      user_id: userId,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      tz: localTimeZone(),
      reminders,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
}

export async function enablePush(userId: string, reminders: Record<ReminderId, ReminderSetting>): Promise<boolean> {
  if (!pushSupported() || !(await requestPermission())) return false
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(VAPID_PUBLIC!) }))
  await syncPushSchedule(userId, reminders, sub)
  return true
}

export async function disablePush(): Promise<void> {
  const sub = await getPushSubscription()
  if (!sub) return
  const sb = await getSupabase()
  await sb?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/* ---------- in-page fallback scheduler ---------- */

// Minute tick + visibility catch-up for devices without a push subscription
// (not signed in, or push unsupported). Fires each due reminder once per day
// as a system notification, within a 4h grace window after its time.
export function startReminderScheduler(getData: () => AppData, markFired: (keys: string[]) => void): () => void {
  let pushed = false
  void getPushSubscription().then((s) => (pushed = !!s))
  const tick = () => {
    if (pushed || !hasPermission()) return
    const data = getData()
    const { date, nowMin } = localClock(new Date(), localTimeZone())
    const due = dueReminders(data.settings.reminders, date, nowMin, (id, d) => !!data.settings.firedKeys[reminderKey(id, d)])
    for (const d of due) {
      const n = buildReminder(data, d.id, d.reportDate, d.smallHours)
      void showNotification(n.title, n.body, n.route, n.tag)
    }
    if (due.length) markFired(due.map((d) => reminderKey(d.id, d.reportDate)))
  }
  tick()
  const iv = setInterval(tick, 60_000)
  const onVis = () => document.visibilityState === 'visible' && tick()
  document.addEventListener('visibilitychange', onVis)
  return () => {
    clearInterval(iv)
    document.removeEventListener('visibilitychange', onVis)
  }
}
