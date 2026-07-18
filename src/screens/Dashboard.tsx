import { useState } from 'react'
import { useStore } from '../lib/store'
import { useAddSheet } from '../lib/sheet'
import {
  expenseTHB,
  fundBalanceTHB,
  heldTotalTHB,
  incomeTHB,
  monthOf,
  netWorthTHB,
  savingsNetTHB,
  spendable,
  spentMonthTHB,
  spentTodayTHB,
  todayStr,
  toTHB,
  yearOf,
} from '../lib/money'
import { fmtMoney, fmtTHB } from '../lib/format'
import { navigate } from '../lib/router'
import { TxRow } from '../components/TxRow'
import { EmptyState, Seg } from '../components/ui'
import { Icon } from '../components/Icons'
import { BudgetStatusRow } from './Budgets'
import { Reconciliation } from './Held'

function HeroStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span className="hero-stat">
      <span className="hl">{label}</span>
      <span className="hv" style={warn ? { color: '#FDE68A' } : undefined}>
        {value}
      </span>
    </span>
  )
}

function Stat({ label, value, cls, sign }: { label: string; value: number; cls: string; sign: string }) {
  return (
    <div className="col-sm" style={{ gap: 2, minWidth: 0 }}>
      <span className="xs muted">{label}</span>
      <span className={`money bold small ${cls}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value > 0 ? sign : ''}
        {fmtTHB(value)}
      </span>
    </div>
  )
}

export function Dashboard() {
  const { data, patchSettings } = useStore()
  const hidden = !!data.settings.hideAmounts
  const openSheet = useAddSheet()
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day')

  const today = todayStr()
  const [from, to] =
    period === 'day'
      ? [today, today]
      : period === 'month'
        ? [`${monthOf(today)}-01`, `${monthOf(today)}-31`]
        : [`${yearOf(today)}-01-01`, `${yearOf(today)}-12-31`]

  const { budgets } = data
  const spentD = spentTodayTHB(data)
  const spentM = spentMonthTHB(data)
  const overD = budgets.dailyLimit && spentD > budgets.dailyLimit
  const overM = budgets.monthlyBudget && spentM > budgets.monthlyBudget
  const held = heldTotalTHB(data)

  const legit = netWorthTHB(data)
  const totalInclHeld = legit + held
  const inFunds = data.funds.reduce((s, f) => s + fundBalanceTHB(data, f.id), 0)
  const leftToday = budgets.dailyLimit ? budgets.dailyLimit - spentD : undefined
  const leftMonth = budgets.monthlyBudget ? budgets.monthlyBudget - spentM : undefined
  const fmtLeft = (n: number) => (n >= 0 ? fmtTHB(n) : `${fmtTHB(-n)} over`)

  const recent = [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)

  return (
    <div className="screen screen-dash">
      <div className="hero-card col-sm">
        <div className="spread">
          <span className="hero-label">My money · held excluded</span>
          <button
            className="btn-icon"
            style={{ color: '#fff', minHeight: 34, minWidth: 34, opacity: 0.9 }}
            onClick={() => patchSettings({ hideAmounts: !hidden })}
            aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
            aria-pressed={hidden}
          >
            <Icon name={hidden ? 'eyeOff' : 'eye'} size={20} />
          </button>
        </div>
        <span className="hero-balance">{fmtTHB(legit)}</span>
        <div className="chip-row" style={{ marginInline: 0, paddingInline: 0 }}>
          {data.accounts.map((a) => {
            const bal = spendable(data.transactions, a.id)
            return (
              <span className="hero-chip money" key={a.id}>
                <span aria-hidden>{a.icon}</span> {a.name}: {fmtMoney(bal, a.currency)}
                {a.currency !== 'THB' && ` (≈${fmtTHB(toTHB(bal, a))})`}
              </span>
            )
          })}
        </div>
        <div className="hero-stats">
          <HeroStat label="Total · incl. held" value={fmtTHB(totalInclHeld)} />
          <HeroStat label="Held for others" value={fmtTHB(held)} />
          <HeroStat label="In savings funds" value={fmtTHB(inFunds)} />
          {leftToday !== undefined && (
            <HeroStat label="Budget left today" value={fmtLeft(leftToday)} warn={leftToday < 0} />
          )}
          {leftMonth !== undefined && (
            <HeroStat label="Budget left this month" value={fmtLeft(leftMonth)} warn={leftMonth < 0} />
          )}
        </div>
      </div>

      {overD && (
        <button className="banner over" onClick={() => navigate('/budgets')}>
          <Icon name="warn" size={18} /> Daily limit exceeded — {fmtTHB(spentD - budgets.dailyLimit!)} over
        </button>
      )}
      {overM && (
        <button className="banner over" onClick={() => navigate('/budgets')}>
          <Icon name="warn" size={18} /> Monthly budget exceeded — {fmtTHB(spentM - budgets.monthlyBudget!)} over
        </button>
      )}

      <div className="card col-sm">
        <div className="spread">
          <span className="label">Overview</span>
          <Seg
            options={[
              { value: 'day', label: 'Today' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <div className="grid3">
          <Stat label="Income" value={incomeTHB(data, from, to)} cls="amt-in" sign="+" />
          <Stat label="Spending" value={expenseTHB(data, from, to)} cls="amt-out" sign="−" />
          <Stat label="Savings" value={savingsNetTHB(data, from, to)} cls="amt-sav" sign="+" />
        </div>
      </div>

      {(budgets.dailyLimit || budgets.monthlyBudget) && (
        <button className="card col-sm" style={{ textAlign: 'left' }} onClick={() => navigate('/budgets')}>
          <span className="label">Budget status</span>
          {budgets.dailyLimit && <BudgetStatusRow label="Today" spent={spentD} limit={budgets.dailyLimit} compact />}
          {budgets.monthlyBudget && (
            <BudgetStatusRow label="This month" spent={spentM} limit={budgets.monthlyBudget} compact />
          )}
        </button>
      )}

      {held > 0.005 && (
        <>
          <button className="card tint-held spread" onClick={() => navigate('/held')}>
            <span className="rowx">
              <span style={{ fontSize: 20 }} aria-hidden>
                🤝
              </span>
              <span className="small bold">Holding for others</span>
            </span>
            <span className="rowx" style={{ gap: 6 }}>
              <span className="money amt-held bold">{fmtTHB(held)}</span>
              <Icon name="chevron" size={16} />
            </span>
          </button>
          <Reconciliation />
        </>
      )}

      <div className="col-sm">
        <div className="spread">
          <span className="label">Recent activity</span>
          {recent.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ledger')}>
              View all
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon="👋"
            title="Welcome to Spendwise"
            hint="Record your first income or expense with the + button below."
            action={
              <button className="btn btn-primary" onClick={() => openSheet({})}>
                Add your first entry
              </button>
            }
          />
        ) : (
          <div className="list">
            {recent.map((tx) => (
              <TxRow key={tx.id} tx={tx} onClick={() => openSheet({ tx })} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
