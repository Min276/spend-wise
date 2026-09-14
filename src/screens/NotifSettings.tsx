import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { useSync } from '../lib/sync'
import type { ReminderId, ReminderSetting } from '../lib/types'
import {
  canNotify,
  disablePush,
  enablePush,
  getPushSubscription,
  pushSupported,
  requestPermission,
  showNotification,
} from '../lib/notify'
import { navigate } from '../lib/router'
import { BackButton } from '../components/ui'

const ROWS: { id: ReminderId; label: string; sub: string; night?: boolean }[] = [
  { id: 'morningBrief', label: 'Morning brief', sub: 'Today + month vs your budgets' },
  { id: 'eveningBrief', label: 'Evening summary', sub: 'Today + month vs your budgets' },
  { id: 'checkinMorning', label: 'Morning check-in', sub: 'Quick spending nudge' },
  { id: 'checkinAfternoon', label: 'Afternoon check-in', sub: 'Quick spending nudge' },
  { id: 'checkinEvening', label: 'Evening check-in', sub: 'Quick spending nudge' },
  { id: 'checkinNight', label: 'Night check-in', sub: 'Reviews the day (00:00/01:00 review yesterday)', night: true },
]

const NIGHT_TIMES = [
  { value: '22:00', label: '10:00 PM' },
  { value: '00:00', label: '12:00 AM' },
  { value: '01:00', label: '1:00 AM' },
]

const StatusRow = ({ label, value, ok }: { label: string; value: string; ok?: boolean }) => (
  <div className="spread">
    <span className="small">{label}</span>
    <span className={`small bold ${ok ? 'amt-in' : 'muted'}`}>{value}</span>
  </div>
)

export function NotifSettings() {
  const { data, patchSettings } = useStore()
  const { session } = useSync()
  const [, bump] = useState(0)
  const [pushOn, setPushOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const perm = canNotify() ? Notification.permission : 'unsupported'
  const supported = pushSupported()

  useEffect(() => {
    getPushSubscription().then((s) => setPushOn(!!s))
  }, [])

  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPushOn(!!(await getPushSubscription()))
      bump((n) => n + 1)
      setBusy(false)
    }
  }

  const setReminder = (id: ReminderId, patch: Partial<ReminderSetting>) =>
    patchSettings({
      reminders: {
        ...data.settings.reminders,
        [id]: { ...data.settings.reminders[id], ...patch },
      },
    })

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/settings" />
          <h1>Notifications</h1>
        </span>
      </div>

      {perm === 'unsupported' ? (
        <div className="banner warn">
          This browser can't show notifications. On iPhone, add Spendwise to your Home Screen first (iOS 16.4+),
          then come back here.
        </div>
      ) : perm === 'denied' ? (
        <div className="banner warn">
          Notifications are blocked for this site. Allow them in your browser/site settings, then come back.
        </div>
      ) : (
        <div className="card col-sm">
          <span className="bold">🔔 Push notifications</span>
          <StatusRow label="Permission" value={perm === 'granted' ? 'Granted' : 'Not asked yet'} ok={perm === 'granted'} />
          <StatusRow
            label="This device"
            value={pushOn === null ? '…' : pushOn ? 'On · works even when the app is closed' : 'Off'}
            ok={!!pushOn}
          />
          {!supported ? (
            <p className="sub">
              Push isn't configured for this deployment — alerts and reminders still appear as system notifications
              while Spendwise is open.
            </p>
          ) : !session ? (
            <p className="sub">
              Sign in first (Settings → Cloud sync) — a server needs to know which device to wake up.{' '}
              <button className="btn btn-sm" onClick={() => navigate('/settings')}>
                Go to sign in
              </button>
            </p>
          ) : null}
          {pushOn ? (
            <div className="grid2">
              <button
                className="btn btn-sm"
                onClick={() => void showNotification('Spendwise', 'Notifications are working 🎉', '/')}
              >
                Send test
              </button>
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={run(disablePush)}>
                Turn off on this device
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              disabled={busy || (supported && !session)}
              onClick={run(async () => {
                if (supported && session) {
                  if (!(await enablePush(session.user.id, data.settings.reminders)))
                    throw new Error('Permission was not granted.')
                } else if (!(await requestPermission())) throw new Error('Permission was not granted.')
              })}
            >
              {supported ? 'Enable push notifications' : 'Allow notifications'}
            </button>
          )}
          {error && <p className="banner over">{error}</p>}
        </div>
      )}

      <div className="col-sm">
        <span className="label">Alerts</span>
        <div className="card">
          <div className="set-row" style={{ borderTop: 'none', padding: 0 }}>
            <span className="lrow-main">
              <span className="t">Budget threshold alerts</span>
              <span className="s">Instant notification at 80% and when a limit is exceeded</span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={data.settings.thresholdNotifs}
              onChange={(e) => patchSettings({ thresholdNotifs: e.target.checked })}
              aria-label="Budget threshold alerts"
            />
          </div>
        </div>
      </div>

      <div className="col-sm">
        <span className="label">Scheduled reminders</span>
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {ROWS.map((r) => {
            const s = data.settings.reminders[r.id]
            return (
              <div className="set-row" key={r.id}>
                <span className="lrow-main">
                  <span className="t">{r.label}</span>
                  <span className="s">{r.sub}</span>
                </span>
                {r.night ? (
                  <select
                    className="input"
                    style={{ width: 110, minHeight: 38 }}
                    value={s.time}
                    disabled={!s.enabled}
                    onChange={(e) => setReminder(r.id, { time: e.target.value })}
                    aria-label={`${r.label} time`}
                  >
                    {NIGHT_TIMES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    style={{ width: 110, minHeight: 38 }}
                    type="time"
                    value={s.time}
                    disabled={!s.enabled}
                    onChange={(e) => e.target.value && setReminder(r.id, { time: e.target.value })}
                    aria-label={`${r.label} time`}
                  />
                )}
                <input
                  type="checkbox"
                  className="switch"
                  checked={s.enabled}
                  onChange={(e) => setReminder(r.id, { enabled: e.target.checked })}
                  aria-label={`${r.label} enabled`}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="card col-sm">
        <span className="label">Good to know</span>
        <p className="sub">
          With push on, reminders arrive even when Spendwise is closed. The server only ever learns your reminder
          times and timezone — the notification text is written on your device from your own data, so your ledger
          stays private.
        </p>
        <p className="sub">
          Budget alerts fire the moment an entry crosses a limit. Without push, reminders still show while the app
          is open or in the background.
        </p>
      </div>
    </div>
  )
}
