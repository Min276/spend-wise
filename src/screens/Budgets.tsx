import { useState } from 'react'
import { useStore } from '../lib/store'
import type { ID } from '../lib/types'
import { spentMonthByCategoryTHB, spentMonthTHB, spentTodayTHB } from '../lib/money'
import { displayOf, fmtTHB } from '../lib/format'
import { BackButton, ConfirmDialog, Field, Progress, RowIcon, Sheet, parseAmount } from '../components/ui'
import { Icon } from '../components/Icons'

function LimitSheet({ onClose }: { onClose: () => void }) {
  const { data, setBudgets } = useStore()
  const disp = displayOf(data.settings)
  const [dailyStr, setDailyStr] = useState(data.budgets.dailyLimit ? disp.str(data.budgets.dailyLimit) : '')
  const [monthlyStr, setMonthlyStr] = useState(
    data.budgets.monthlyBudget ? disp.str(data.budgets.monthlyBudget) : '',
  )
  const ok = (s: string) => /^[\d,]*\.?\d{0,2}$/.test(s)
  const save = () => {
    setBudgets({
      ...data.budgets,
      dailyLimit: disp.parse(dailyStr, data.budgets.dailyLimit),
      monthlyBudget: disp.parse(monthlyStr, data.budgets.monthlyBudget),
    })
    onClose()
  }
  return (
    <Sheet title="Set limits" onClose={onClose}>
      <Field label={`Daily spending limit (${disp.sym.trim()})`}>
        <input
          className="input"
          inputMode="decimal"
          placeholder="e.g. 800 — leave empty for none"
          value={dailyStr}
          autoFocus
          onChange={(e) => ok(e.target.value) && setDailyStr(e.target.value)}
        />
      </Field>
      <Field label={`Monthly budget (${disp.sym.trim()})`}>
        <input
          className="input"
          inputMode="decimal"
          placeholder="e.g. 20,000 — leave empty for none"
          value={monthlyStr}
          onChange={(e) => ok(e.target.value) && setMonthlyStr(e.target.value)}
        />
      </Field>
      <button className="btn btn-primary btn-full" onClick={save}>
        Save limits
      </button>
    </Sheet>
  )
}

function CatBudgetSheet({ categoryId, onClose }: { categoryId?: ID; onClose: () => void }) {
  const { data, setBudgets } = useStore()
  const editing = !!categoryId
  const disp = displayOf(data.settings)
  const available = data.categories.filter((c) => editing || !(c.id in data.budgets.perCategory))
  const [catId, setCatId] = useState(categoryId ?? available[0]?.id ?? '')
  const prev = categoryId ? data.budgets.perCategory[categoryId] : undefined
  const [amountStr, setAmountStr] = useState(prev ? disp.str(prev) : '')
  const save = () => {
    const amt = disp.parse(amountStr, prev)
    if (!catId || !amt) return
    setBudgets({ ...data.budgets, perCategory: { ...data.budgets.perCategory, [catId]: amt } })
    onClose()
  }
  const remove = () => {
    const perCategory = { ...data.budgets.perCategory }
    delete perCategory[catId]
    setBudgets({ ...data.budgets, perCategory })
    onClose()
  }
  return (
    <Sheet title={editing ? 'Edit category budget' : 'Category budget'} onClose={onClose}>
      <Field label="Category">
        <select className="input" value={catId} disabled={editing} onChange={(e) => setCatId(e.target.value)}>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Monthly budget (${disp.sym.trim()})`}>
        <input
          className="input"
          inputMode="decimal"
          value={amountStr}
          autoFocus
          onChange={(e) => /^[\d,]*\.?\d{0,2}$/.test(e.target.value) && setAmountStr(e.target.value)}
        />
      </Field>
      <button className="btn btn-primary btn-full" disabled={!catId || parseAmount(amountStr) <= 0} onClick={save}>
        Save
      </button>
      {editing && (
        <button className="btn btn-ghost btn-full" style={{ color: 'var(--expense)' }} onClick={remove}>
          Remove this budget
        </button>
      )}
    </Sheet>
  )
}

export function BudgetStatusRow({
  label,
  spent,
  limit,
  compact,
}: {
  label: string
  spent: number
  limit: number
  compact?: boolean
}) {
  const remaining = limit - spent
  return (
    <div className="col-sm" style={{ gap: 6 }}>
      <div className="spread">
        <span className={compact ? 'small' : 'bold'}>{label}</span>
        <span className="small money">
          {fmtTHB(spent)} / {fmtTHB(limit)}
        </span>
      </div>
      <Progress value={spent} max={limit} />
      <span className={`xs money ${remaining < 0 ? 'amt-out' : 'muted'}`}>
        {remaining >= 0 ? `${fmtTHB(remaining)} left` : `${fmtTHB(-remaining)} over`}
      </span>
    </div>
  )
}

export function Budgets() {
  const { data, setBudgets } = useStore()
  const { budgets } = data
  const [limitSheet, setLimitSheet] = useState(false)
  const [catSheet, setCatSheet] = useState<{ categoryId?: ID } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const spentD = spentTodayTHB(data)
  const spentM = spentMonthTHB(data)
  const byCat = spentMonthByCategoryTHB(data)
  const hasBudget = !!budgets.dailyLimit || !!budgets.monthlyBudget
  const catBudgets = Object.entries(budgets.perCategory)

  const overD = budgets.dailyLimit && spentD > budgets.dailyLimit
  const overM = budgets.monthlyBudget && spentM > budgets.monthlyBudget
  const warnD = !overD && budgets.dailyLimit && spentD >= 0.8 * budgets.dailyLimit
  const warnM = !overM && budgets.monthlyBudget && spentM >= 0.8 * budgets.monthlyBudget

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/more" />
          <h1>Budgets & Limits</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setLimitSheet(true)}>
          <Icon name="pencil" size={14} /> Edit
        </button>
      </div>

      {overD && (
        <div className="banner over">
          <Icon name="warn" size={18} /> Daily limit exceeded — {fmtTHB(spentD - budgets.dailyLimit!)} over.
        </div>
      )}
      {overM && (
        <div className="banner over">
          <Icon name="warn" size={18} /> Monthly budget exceeded — {fmtTHB(spentM - budgets.monthlyBudget!)} over.
        </div>
      )}
      {warnD && (
        <div className="banner warn">
          <Icon name="warn" size={18} /> {fmtTHB(budgets.dailyLimit! - spentD)} left of today's limit.
        </div>
      )}
      {warnM && (
        <div className="banner warn">
          <Icon name="warn" size={18} /> {fmtTHB(budgets.monthlyBudget! - spentM)} left in this month's budget.
        </div>
      )}

      {!hasBudget && catBudgets.length === 0 ? (
        <div className="card col-sm">
          <span className="bold">No limits set yet</span>
          <p className="sub">
            Set a daily spending limit and a monthly budget — Spendwise tracks them live and warns you at 80%
            and when you go over.
          </p>
          <button className="btn btn-primary" onClick={() => setLimitSheet(true)}>
            Set my limits
          </button>
        </div>
      ) : (
        <>
          {budgets.dailyLimit && (
            <div className="card">
              <BudgetStatusRow label="Today" spent={spentD} limit={budgets.dailyLimit} />
            </div>
          )}
          {budgets.monthlyBudget && (
            <div className="card">
              <BudgetStatusRow label="This month" spent={spentM} limit={budgets.monthlyBudget} />
            </div>
          )}
        </>
      )}

      <div className="spread">
        <span className="label">Category budgets (monthly)</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setCatSheet({})} disabled={data.categories.length === 0}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>

      {catBudgets.length === 0 ? (
        <p className="muted">Optional — set a monthly cap for specific categories like Food or Fun.</p>
      ) : (
        <div className="list">
          {catBudgets.map(([catId, limit]) => {
            const cat = data.categories.find((c) => c.id === catId)
            if (!cat) return null
            return (
              <button className="lrow" key={catId} onClick={() => setCatSheet({ categoryId: catId })}>
                <RowIcon emoji={cat.icon} color={cat.color} />
                <span className="lrow-main" style={{ paddingRight: 8 }}>
                  <BudgetStatusRow label={cat.name} spent={byCat.get(catId) ?? 0} limit={limit} compact />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {hasBudget && (
        <button className="btn btn-ghost" style={{ color: 'var(--expense)' }} onClick={() => setConfirmClear(true)}>
          Clear all limits
        </button>
      )}

      {limitSheet && <LimitSheet onClose={() => setLimitSheet(false)} />}
      {catSheet && <CatBudgetSheet categoryId={catSheet.categoryId} onClose={() => setCatSheet(null)} />}
      {confirmClear && (
        <ConfirmDialog
          title="Clear all limits?"
          body="Daily, monthly, and category budgets will be removed. Transactions are not affected."
          confirmLabel="Clear"
          onConfirm={() => setBudgets({ perCategory: {} })}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </div>
  )
}
