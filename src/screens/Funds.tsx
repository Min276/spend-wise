import { useState } from 'react'
import { useStore } from '../lib/store'
import { useAddSheet } from '../lib/sheet'
import type { Fund } from '../lib/types'
import { filterTxs, fundBalanceTHB, monthOf, savingsNetTHB, todayStr, yearOf } from '../lib/money'
import { fmtDate, fmtTHB } from '../lib/format'
import { CHART_PALETTE } from '../lib/seed'
import { BackButton, EmptyState, Field, Progress, RowIcon, Seg, Sheet, parseAmount } from '../components/ui'
import { Icon } from '../components/Icons'
import { TxRow } from '../components/TxRow'
import { DeleteEntityDialog } from './Manage'

function FundForm({ fund, onClose }: { fund?: Fund; onClose: () => void }) {
  const { data, addEntity, updateEntity } = useStore()
  const [name, setName] = useState(fund?.name ?? '')
  const [icon, setIcon] = useState(fund?.icon ?? '🎯')
  const [color, setColor] = useState(fund?.color ?? '#4F46E5')
  const [targetStr, setTargetStr] = useState(fund?.target ? String(fund.target) : '')
  const [deadline, setDeadline] = useState(fund?.deadline ?? '')
  const [accountId, setAccountId] = useState(fund?.accountId ?? '')

  const save = () => {
    const item = {
      name: name.trim(),
      icon: icon.trim() || '🎯',
      color,
      target: parseAmount(targetStr) || undefined,
      deadline: deadline || undefined,
      accountId: accountId || undefined,
    }
    if (fund) updateEntity('funds', { ...fund, ...item })
    else addEntity('funds', item)
    onClose()
  }

  return (
    <Sheet title={fund ? 'Edit fund' : 'New savings fund'} onClose={onClose}>
      <div className="grid2">
        <Field label="Name">
          <input className="input" value={name} autoFocus={!fund} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Icon (emoji)">
          <input className="input" value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} />
        </Field>
        <Field label="Target amount (฿, optional)">
          <input
            className="input"
            inputMode="decimal"
            placeholder="e.g. 50,000"
            value={targetStr}
            onChange={(e) => /^[\d,]*\.?\d{0,2}$/.test(e.target.value) && setTargetStr(e.target.value)}
          />
        </Field>
        <Field label="Deadline (optional)">
          <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      <Field label="Linked account (optional)">
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Not linked</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Color">
        <div className="swatches">
          {CHART_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </Field>
      <button className="btn btn-primary btn-full" disabled={!name.trim()} onClick={save}>
        Save
      </button>
    </Sheet>
  )
}

function daysUntil(deadline: string): number {
  const [y, m, d] = deadline.split('-').map(Number)
  const [ty, tm, td] = todayStr().split('-').map(Number)
  return Math.round((new Date(y!, m! - 1, d!).getTime() - new Date(ty!, tm! - 1, td!).getTime()) / 86400000)
}

function FundCard({ fund, onEdit, onDelete }: { fund: Fund; onEdit: () => void; onDelete: () => void }) {
  const { data } = useStore()
  const openSheet = useAddSheet()
  const [expanded, setExpanded] = useState(false)

  const bal = fundBalanceTHB(data, fund.id)
  const acc = data.accounts.find((a) => a.id === fund.accountId)
  const history = filterTxs(data.transactions, { fundId: fund.id }).sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
  const days = fund.deadline ? daysUntil(fund.deadline) : null
  const pct = fund.target ? Math.round((bal / fund.target) * 100) : null

  const preset = (type: 'fund_contribute' | 'fund_withdraw') =>
    openSheet({ preset: { type, fundId: fund.id, accountId: fund.accountId } })

  return (
    <div className="card col-sm">
      <button className="spread" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <span className="rowx">
          <RowIcon emoji={fund.icon} color={fund.color} />
          <span className="lrow-main" style={{ textAlign: 'left' }}>
            <span className="t">{fund.name}</span>
            <span className="s">
              {acc ? acc.name : 'Not linked'}
              {fund.deadline &&
                ` · ${
                  days! < 0 ? `${-days!}d overdue` : days === 0 ? 'due today' : `${days}d left`
                } (${fmtDate(fund.deadline)})`}
            </span>
          </span>
        </span>
        <span className="lrow-right">
          <span className="t money amt-sav">{fmtTHB(bal)}</span>
          {fund.target && <span className="s money">of {fmtTHB(fund.target)}</span>}
        </span>
      </button>

      {fund.target && (
        <>
          <Progress value={bal} max={fund.target} kind="sav" />
          <span className="muted money">
            {pct}% saved · {fmtTHB(Math.max(0, fund.target - bal))} to go
          </span>
        </>
      )}

      <div className="grid3">
        <button className="btn btn-sm btn-primary" onClick={() => preset('fund_contribute')}>
          <Icon name="plus" size={14} /> Add
        </button>
        <button className="btn btn-sm" disabled={bal <= 0} onClick={() => preset('fund_withdraw')}>
          Withdraw
        </button>
        <span className="rowx" style={{ justifyContent: 'flex-end', gap: 4 }}>
          <button className="btn-icon" style={{ minHeight: 36, minWidth: 36 }} onClick={onEdit} aria-label="Edit fund">
            <Icon name="pencil" size={17} />
          </button>
          <button className="btn-icon" style={{ minHeight: 36, minWidth: 36 }} onClick={onDelete} aria-label="Delete fund">
            <Icon name="trash" size={17} />
          </button>
        </span>
      </div>

      {expanded &&
        (history.length === 0 ? (
          <p className="muted">No contributions yet.</p>
        ) : (
          <div className="list">
            {history.map((tx) => (
              <TxRow key={tx.id} tx={tx} onClick={() => openSheet({ tx })} />
            ))}
          </div>
        ))}
    </div>
  )
}

export function Funds() {
  const { data } = useStore()
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('month')
  const [editing, setEditing] = useState<Fund | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Fund | null>(null)

  const today = todayStr()
  const range =
    period === 'day'
      ? ([today, today] as const)
      : period === 'month'
        ? ([`${monthOf(today)}-01`, `${monthOf(today)}-31`] as const)
        : ([`${yearOf(today)}-01-01`, `${yearOf(today)}-12-31`] as const)
  const saved = savingsNetTHB(data, range[0], range[1])
  const totalSaved = data.funds.reduce((s, f) => s + fundBalanceTHB(data, f.id), 0)

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/more" />
          <h1>Savings Funds</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>

      <div className="card col-sm">
        <div className="spread">
          <span className="label">Saved {period === 'day' ? 'today' : period === 'month' ? 'this month' : 'this year'}</span>
          <span className="label">Total in funds</span>
        </div>
        <div className="spread">
          <span className="money amt-sav" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>
            {saved >= 0 ? '+' : ''}
            {fmtTHB(saved)}
          </span>
          <span className="money" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>
            {fmtTHB(totalSaved)}
          </span>
        </div>
        <Seg
          options={[
            { value: 'day', label: 'Day' },
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {data.funds.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No savings funds"
          hint="Create a fund for each goal — education, visa, emergency…"
          action={
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              Create a fund
            </button>
          }
        />
      ) : (
        data.funds.map((f) => (
          <FundCard key={f.id} fund={f} onEdit={() => setEditing(f)} onDelete={() => setDeleting(f)} />
        ))
      )}

      {editing && <FundForm fund={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <DeleteEntityDialog kind="funds" id={deleting.id} name={deleting.name} onClose={() => setDeleting(null)} />
      )}
    </div>
  )
}
