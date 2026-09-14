import assert from 'node:assert/strict'
import { createECDH, randomBytes } from 'node:crypto'
import webpush from 'web-push'
import { seedData } from '../src/lib/seed.ts'
import { shiftDate } from '../src/lib/money.ts'
import { buildReminder, dueReminders, localClock, reminderKey } from '../src/lib/reminders.ts'
import { setDisplay } from '../src/lib/format.ts'

const reminders = seedData().settings.reminders // 09:00 briefs/check-ins, 15:00, 18:00, 21:00, 22:00
const none = () => false

// due = scheduled time reached, within the grace window, not yet fired for that day
assert.deepEqual(dueReminders(reminders, '2026-09-15', 8 * 60 + 59, none).map((d) => d.id), [], 'nothing before 09:00')
assert.deepEqual(
  dueReminders(reminders, '2026-09-15', 9 * 60, none).map((d) => d.id),
  ['morningBrief', 'checkinMorning'],
  'both 09:00 reminders at 09:00',
)
assert.deepEqual(dueReminders(reminders, '2026-09-15', 9 * 60 + 31, none, 30).map((d) => d.id), [], 'server grace (30m) elapsed')
assert.deepEqual(
  dueReminders(reminders, '2026-09-15', 12 * 60, none).map((d) => d.id),
  ['morningBrief', 'checkinMorning'],
  'page grace (4h) still catches up at noon',
)
assert.deepEqual(
  dueReminders(reminders, '2026-09-15', 9 * 60, (id) => id === 'morningBrief').map((d) => d.id),
  ['checkinMorning'],
  'already-fired reminders are skipped',
)
assert.equal(dueReminders({ ...reminders, checkinMorning: { enabled: false, time: '09:00' } }, '2026-09-15', 9 * 60, none).length, 1, 'disabled rows never fire')

// a 00:00/01:00 night slot reports the previous day
const night = dueReminders({ checkinNight: { enabled: true, time: '00:00' } }, '2026-09-15', 10, none)
assert.equal(night.length, 1)
assert.equal(night[0]!.reportDate, '2026-09-14')
assert.equal(night[0]!.smallHours, true)
assert.equal(reminderKey('checkinNight', '2026-09-14'), 'rem-checkinNight-2026-09-14')

// timezone clock: the same instant is a different local day/minute per zone
const t = new Date('2026-09-15T02:30:00Z')
assert.deepEqual(localClock(t, 'Asia/Bangkok'), { date: '2026-09-15', nowMin: 9 * 60 + 30 }, 'UTC+7')
assert.deepEqual(localClock(t, 'America/New_York'), { date: '2026-09-14', nowMin: 22 * 60 + 30 }, 'EDT, previous day')
assert.deepEqual(localClock(new Date('2026-09-15T17:00:00Z'), 'Asia/Bangkok').nowMin, 0, 'midnight reads as 0, not 24×60')
assert.equal(localClock(t, 'Not/AZone').date, '2026-09-15', 'bad zone falls back to Bangkok')

// notification text comes from the data on the device
const data = seedData()
data.budgets = { dailyLimit: 800, monthlyBudget: 20000, perCategory: {} }
data.transactions = [
  { id: 'a', type: 'expense', amount: 300, date: '2026-09-15', accountId: 'acc-kbank', createdAt: '', categoryId: 'cat-food' },
  { id: 'b', type: 'expense', amount: 5000, date: '2026-09-02', accountId: 'acc-kbank', createdAt: '', categoryId: 'cat-rent' },
]
setDisplay(undefined)
let n = buildReminder(data, 'checkinMorning', '2026-09-15', false)
assert.equal(n.title, 'Morning check-in ☕')
assert.equal(n.body, 'Today: ฿300 of ฿800 · ฿500 left')
n = buildReminder(data, 'morningBrief', '2026-09-15', false)
assert.equal(n.body, 'Today: ฿300 of ฿800 (฿500 left) · Month: ฿5,300 of ฿20,000 (฿14,700 left)')
n = buildReminder(data, 'checkinNight', shiftDate('2026-09-16', -1), true)
assert.ok(n.body.startsWith('Yesterday: ฿300'), 'night slot says "Yesterday"')
setDisplay({ currency: 'USD', rates: { USD: 30, VND: 770, MMK: 133 } })
assert.equal(buildReminder(data, 'checkinMorning', '2026-09-15', false).body, 'Today: $10 of $26.67 · $16.67 left', 'display currency applies')
setDisplay(undefined)
assert.equal(buildReminder(null, 'eveningBrief', '2026-09-15', false).body, 'Tap to review your spending.', 'no snapshot → generic')
assert.equal(n.tag, 'rem-checkinNight-2026-09-15', 'tag dedupes per reminder-day')

// the Web Push request itself (VAPID JWT + aes128gcm payload) builds offline with
// throwaway server keys and a synthetic browser subscription (P-256 point + 16-byte auth)
const keys = webpush.generateVAPIDKeys()
const browser = createECDH('prime256v1')
browser.generateKeys()
const details = webpush.generateRequestDetails(
  {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: browser.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') },
  },
  JSON.stringify({ id: 'morningBrief', date: '2026-09-15', small: false }),
  { vapidDetails: { subject: 'mailto:test@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 3600 },
)
assert.equal(details.method, 'POST')
assert.equal(details.headers['Content-Encoding'], 'aes128gcm')
assert.ok(String(details.headers.Authorization).startsWith('vapid t='), 'VAPID auth header present')
assert.ok((details.body as Buffer).length > 100, 'encrypted payload produced')

console.log('✓ reminders.check: due-time logic, timezone clock, notification text and Web Push request build pass')
