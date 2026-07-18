import { useState } from 'react'
import { useStore } from '../lib/store'
import type { ReminderId, ReminderSetting } from '../lib/types'
import { canNotify, requestPermission, showNotification } from '../lib/notify'
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

export function NotifSettings() {
  const { data, patchSettings } = useStore()
  const [, bump] = useState(0)
  const perm = canNotify() ? Notification.permission : 'unsupported'

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

      {perm === 'unsupported' && (
        <div className="banner warn">This browser doesn't support notifications. In-app alerts still work.</div>
      )}
      {perm === 'default' && (
        <div className="card col-sm">
          <span className="bold">🔔 Notifications are off</span>
          <p className="sub">Allow notifications to get reminders and budget alerts even when Spendwise is in the background.</p>
          <button
            className="btn btn-primary"
            onClick={async () => {
              await requestPermission()
              patchSettings({ notifPermissionAsked: true })
              bump((n) => n + 1)
            }}
          >
            Enable notifications
          </button>
        </div>
      )}
      {perm === 'denied' && (
        <div className="banner warn">
          Notifications are blocked for this site. Enable them in your browser/site settings, then come back.
        </div>
      )}
      {perm === 'granted' && (
        <div className="card spread">
          <span className="small">✅ Notifications enabled</span>
          <button
            className="btn btn-sm"
            onClick={() => void showNotification('Spendwise', 'Notifications are working 🎉', '/')}
          >
            Send test
          </button>
        </div>
      )}

      <div className="col-sm">
        <span className="label">Alerts</span>
        <div className="card">
          <div className="set-row" style={{ borderTop: 'none', padding: 0 }}>
            <span className="lrow-main">
              <span className="t">Budget threshold alerts</span>
              <span className="s">Instant alert at 80% and when a limit is exceeded</span>
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
        <p className="muted">In-app banners and toasts are always on — they need no permission.</p>
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
          Spendwise is fully private — no server, so there is no true push while the app is closed. Reminders
          fire while the app (or installed PWA) is open or running in the background, with a catch-up when you
          come back the same day.
        </p>
        <p className="sub">
          On iPhone, add Spendwise to your Home Screen (iOS 16.4+) — Safari only allows notifications for
          installed web apps.
        </p>
      </div>
    </div>
  )
}
