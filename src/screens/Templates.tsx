import { useStore } from '../lib/store'
import { byId } from '../lib/money'
import { fmtMoney } from '../lib/format'
import { BackButton, EmptyState, Field } from '../components/ui'
import { Icon } from '../components/Icons'

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

export function Templates() {
  const { data, updateTemplate, deleteTemplate } = useStore()
  const accounts = byId(data.accounts)

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/settings" />
          <h1>Templates & recurring</h1>
        </span>
      </div>

      {data.templates.length === 0 ? (
        <EmptyState
          icon="🔁"
          title="No templates yet"
          hint="On the Add screen, fill in a common entry and tap “Save as template”. Then quick-add it from the dashboard, or set it to repeat monthly here."
        />
      ) : (
        <div className="col-sm">
          {data.templates.map((t) => {
            const acc = accounts.get(t.preset.accountId ?? '')
            return (
              <div className="card col-sm" key={t.id}>
                <div className="spread">
                  <span className="bold">{t.label}</span>
                  <span className="money small">
                    {t.preset.amount ? fmtMoney(t.preset.amount, acc?.currency) : ''}
                  </span>
                </div>
                {acc && <span className="xs muted">{acc.icon} {acc.name}</span>}

                <label className="spread">
                  <span className="small">Repeat monthly</span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={!!t.repeatDay}
                    onChange={(e) =>
                      updateTemplate({
                        ...t,
                        repeatDay: e.target.checked ? t.repeatDay || 1 : undefined,
                        lastPosted: e.target.checked ? t.lastPosted : undefined,
                      })
                    }
                  />
                </label>

                {t.repeatDay != null && (
                  <Field label="Post on day of month">
                    <select
                      className="input"
                      value={t.repeatDay}
                      onChange={(e) => updateTemplate({ ...t, repeatDay: Number(e.target.value) })}
                    >
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--expense)', alignSelf: 'flex-start' }}
                  onClick={() => deleteTemplate(t.id)}
                >
                  <Icon name="trash" size={16} /> Delete
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
