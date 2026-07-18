import type { AppData, ReminderId } from './types.ts'
import type { AlertEvent } from './alerts.ts'
import { dateStr, expenseTHB, monthOf, shiftDate, spentMonthTHB } from './money.ts'
import { fmtTHB } from './format.ts'

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

/* ---------- scheduled reminders ---------- */

function briefBody(data: AppData, forDate: string, prevDay: boolean): string {
  const spentD = expenseTHB(data, forDate, forDate)
  const spentM = spentMonthTHB(data, monthOf(forDate))
  const { dailyLimit, monthlyBudget } = data.budgets
  const word = prevDay ? 'Yesterday' : 'Today'
  const dPart = dailyLimit
    ? `${word}: ${fmtTHB(spentD)} of ${fmtTHB(dailyLimit)} (${
        spentD <= dailyLimit ? fmtTHB(dailyLimit - spentD) + ' left' : fmtTHB(spentD - dailyLimit) + ' over'
      })`
    : `${word}: ${fmtTHB(spentD)} spent`
  const mPart = monthlyBudget
    ? `Month: ${fmtTHB(spentM)} of ${fmtTHB(monthlyBudget)} (${
        spentM <= monthlyBudget ? fmtTHB(monthlyBudget - spentM) + ' left' : fmtTHB(spentM - monthlyBudget) + ' over'
      })`
    : `Month: ${fmtTHB(spentM)} spent`
  return `${dPart} · ${mPart}`
}

function checkinBody(data: AppData, forDate: string, prevDay: boolean): string {
  const spent = expenseTHB(data, forDate, forDate)
  const { dailyLimit } = data.budgets
  const word = prevDay ? 'Yesterday' : 'Today'
  if (!dailyLimit) return `${word}: ${fmtTHB(spent)} spent`
  return `${word}: ${fmtTHB(spent)} of ${fmtTHB(dailyLimit)} · ${
    spent <= dailyLimit ? fmtTHB(dailyLimit - spent) + ' left' : fmtTHB(spent - dailyLimit) + ' over'
  }`
}

const REMINDER_META: Record<ReminderId, { title: string; kind: 'brief' | 'checkin'; route: string }> = {
  morningBrief: { title: 'Morning brief ☀️', kind: 'brief', route: '/budgets' },
  eveningBrief: { title: 'Evening summary 🌙', kind: 'brief', route: '/budgets' },
  checkinMorning: { title: 'Morning check-in ☕', kind: 'checkin', route: '/' },
  checkinAfternoon: { title: 'Afternoon check-in 🌤', kind: 'checkin', route: '/' },
  checkinEvening: { title: 'Evening check-in 🌆', kind: 'checkin', route: '/' },
  checkinNight: { title: 'Night check-in 🌙', kind: 'checkin', route: '/' },
}

// Minute tick + visibility catch-up. Fires each due reminder once per day
// (settings.firedKeys), within a 4h grace window after its scheduled time.
// A 00:00/01:00 night slot reports the day that just ended.
export function startReminderScheduler(
  getData: () => AppData,
  markFired: (keys: string[]) => void,
  fallback: (title: string, body: string) => void,
): () => void {
  const tick = () => {
    const data = getData()
    const now = new Date()
    const today = dateStr(now)
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const fired: string[] = []
    for (const id of Object.keys(REMINDER_META) as ReminderId[]) {
      const meta = REMINDER_META[id]
      const s = data.settings.reminders[id]
      if (!s?.enabled || !s.time) continue
      const [h, m] = s.time.split(':').map(Number)
      const schedMin = (h ?? 0) * 60 + (m ?? 0)
      const smallHours = schedMin < 6 * 60
      const reportDate = smallHours ? shiftDate(today, -1) : today
      const key = `rem-${id}-${reportDate}`
      if (data.settings.firedKeys[key]) continue
      const since = nowMin - schedMin
      if (since < 0 || since > 240) continue
      const body =
        meta.kind === 'brief' ? briefBody(data, reportDate, smallHours) : checkinBody(data, reportDate, smallHours)
      if (hasPermission()) void showNotification(meta.title, body, meta.route, key)
      else fallback(meta.title, body)
      fired.push(key)
    }
    if (fired.length) markFired(fired)
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
