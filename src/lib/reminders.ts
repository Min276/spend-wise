import type { AppData, ReminderId, ReminderSetting } from './types.ts'
import { expenseTHB, monthOf, shiftDate, spentMonthTHB } from './money.ts'
import { fmtTHB } from './format.ts'

// Pure reminder logic shared by three runtimes: the page (while the app is
// open), the service worker (when a push arrives), and the Vercel tick that
// decides what to push. Nothing here may touch window/document/process.

export const REMINDER_META: Record<ReminderId, { title: string; kind: 'brief' | 'checkin'; route: string }> = {
  morningBrief: { title: 'Morning brief ☀️', kind: 'brief', route: '/budgets' },
  eveningBrief: { title: 'Evening summary 🌙', kind: 'brief', route: '/budgets' },
  checkinMorning: { title: 'Morning check-in ☕', kind: 'checkin', route: '/' },
  checkinAfternoon: { title: 'Afternoon check-in 🌤', kind: 'checkin', route: '/' },
  checkinEvening: { title: 'Evening check-in 🌆', kind: 'checkin', route: '/' },
  checkinNight: { title: 'Night check-in 🌙', kind: 'checkin', route: '/' },
}

export const REMINDER_IDS = Object.keys(REMINDER_META) as ReminderId[]

export const reminderKey = (id: ReminderId, reportDate: string) => `rem-${id}-${reportDate}`

export interface DueReminder {
  id: ReminderId
  reportDate: string
  smallHours: boolean
}

// Which reminders are due at a given local wall-clock moment: each fires once
// per day, within `grace` minutes after its scheduled time. A 00:00–05:59 slot
// reports the day that just ended.
export function dueReminders(
  reminders: Partial<Record<ReminderId, ReminderSetting>>,
  today: string,
  nowMin: number,
  alreadyFired: (id: ReminderId, reportDate: string) => boolean,
  grace = 240,
): DueReminder[] {
  const out: DueReminder[] = []
  for (const id of REMINDER_IDS) {
    const s = reminders[id]
    if (!s?.enabled || !s.time) continue
    const [h, m] = s.time.split(':').map(Number)
    const schedMin = (h ?? 0) * 60 + (m ?? 0)
    const smallHours = schedMin < 6 * 60
    const reportDate = smallHours ? shiftDate(today, -1) : today
    if (alreadyFired(id, reportDate)) continue
    const since = nowMin - schedMin
    if (since < 0 || since > grace) continue
    out.push({ id, reportDate, smallHours })
  }
  return out
}

// Local date (YYYY-MM-DD) and minutes-since-midnight in an IANA timezone.
export function localClock(now: Date, tz: string): { date: string; nowMin: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now)
  } catch {
    return localClock(now, 'Asia/Bangkok')
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, nowMin: Number(get('hour')) * 60 + Number(get('minute')) }
}

/* ---------- notification content ---------- */

const leftOrOver = (spent: number, limit: number) =>
  spent <= limit ? fmtTHB(limit - spent) + ' left' : fmtTHB(spent - limit) + ' over'

function briefBody(data: AppData, forDate: string, prevDay: boolean): string {
  const spentD = expenseTHB(data, forDate, forDate)
  const spentM = spentMonthTHB(data, monthOf(forDate))
  const { dailyLimit, monthlyBudget } = data.budgets
  const word = prevDay ? 'Yesterday' : 'Today'
  const dPart = dailyLimit
    ? `${word}: ${fmtTHB(spentD)} of ${fmtTHB(dailyLimit)} (${leftOrOver(spentD, dailyLimit)})`
    : `${word}: ${fmtTHB(spentD)} spent`
  const mPart = monthlyBudget
    ? `Month: ${fmtTHB(spentM)} of ${fmtTHB(monthlyBudget)} (${leftOrOver(spentM, monthlyBudget)})`
    : `Month: ${fmtTHB(spentM)} spent`
  return `${dPart} · ${mPart}`
}

function checkinBody(data: AppData, forDate: string, prevDay: boolean): string {
  const spent = expenseTHB(data, forDate, forDate)
  const { dailyLimit } = data.budgets
  const word = prevDay ? 'Yesterday' : 'Today'
  if (!dailyLimit) return `${word}: ${fmtTHB(spent)} spent`
  return `${word}: ${fmtTHB(spent)} of ${fmtTHB(dailyLimit)} · ${leftOrOver(spent, dailyLimit)}`
}

export interface ReminderNotice {
  title: string
  body: string
  route: string
  tag: string
}

// The notification for one reminder. Without local data (a push that arrives
// on a device that never opened the app) it degrades to a generic nudge.
export function buildReminder(data: AppData | null, id: ReminderId, reportDate: string, smallHours: boolean): ReminderNotice {
  const meta = REMINDER_META[id] ?? REMINDER_META.checkinMorning
  const body = !data
    ? 'Tap to review your spending.'
    : meta.kind === 'brief'
      ? briefBody(data, reportDate, smallHours)
      : checkinBody(data, reportDate, smallHours)
  return { title: meta.title, body, route: meta.route, tag: reminderKey(id, reportDate) }
}
