import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import type { ReminderId, ReminderSetting } from '../src/lib/types.ts'
import { dueReminders, localClock } from '../src/lib/reminders.ts'

// Vercel serverless function, hit every 5 minutes by Supabase pg_cron (see
// supabase/push.sql). For each subscribed device it works out which reminders
// are due in that device's local timezone and sends a Web Push carrying only
// { id, date, small } — the service worker writes the notification text from
// the data on the device, so nothing about the ledger ever reaches here.
//
// ponytail: one sequential pass over all rows per tick. Fine for a handful of
// devices; if this ever serves many users, page the query and fan out sends.

interface Row {
  endpoint: string
  p256dh: string
  auth: string
  tz: string
  reminders: Partial<Record<ReminderId, ReminderSetting>>
  sent: Partial<Record<ReminderId, string>>
}

const env = (k: string) => process.env[k] ?? ''

export async function POST(req: Request): Promise<Response> {
  const secret = env('PUSH_TICK_SECRET')
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 })

  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = env('VAPID_PUBLIC_KEY') || env('VITE_VAPID_PUBLIC_KEY')
  const vapidPrivate = env('VAPID_PRIVATE_KEY')
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) return new Response('push not configured', { status: 500 })

  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', vapidPublic, vapidPrivate)
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: rows, error } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth, tz, reminders, sent')
  if (error) return new Response(error.message, { status: 500 })

  const now = new Date()
  const summary = { devices: rows?.length ?? 0, sent: 0, pruned: 0, failed: 0 }

  for (const row of (rows ?? []) as Row[]) {
    const { date, nowMin } = localClock(now, row.tz || 'Asia/Bangkok')
    const sent = { ...(row.sent ?? {}) }
    // 30-minute grace: a missed tick still delivers, a long outage doesn't spam stale briefs
    const due = dueReminders(row.reminders ?? {}, date, nowMin, (id, d) => sent[id] === d, 30)
    if (!due.length) continue

    let gone = false
    for (const d of due) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ id: d.id, date: d.reportDate, small: d.smallHours }),
          { TTL: 60 * 60, urgency: 'normal' },
        )
        sent[d.id] = d.reportDate
        summary.sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          gone = true // subscription expired or was revoked on the device
          break
        }
        summary.failed++
      }
    }
    if (gone) {
      await sb.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
      summary.pruned++
    } else {
      await sb.from('push_subscriptions').update({ sent }).eq('endpoint', row.endpoint)
    }
  }

  return Response.json(summary)
}

// pg_net can only POST, but a GET is handy for a manual check from the browser bar.
export const GET = POST
