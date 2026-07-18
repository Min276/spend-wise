import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { useAddSheet } from '../lib/sheet'
import type { Gran } from '../lib/money'
import {
  balanceSeriesTHB,
  biggestExpenses,
  dateStr,
  filterTxs,
  fundGrowthTHB,
  heldGrowthTHB,
  seriesByPeriod,
  shiftDate,
  spendByCategoryTHB,
  todayStr,
  yearOf,
} from '../lib/money'
import { fmtDate, fmtMonthKey, fmtTHB } from '../lib/format'
import { Bars, Donut, LegendChips, Lines, PairedBars } from '../components/charts'
import { TxRow } from '../components/TxRow'
import { EmptyState, Field, Seg } from '../components/ui'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card col-sm">
      <span className="label">{title}</span>
      {children}
    </div>
  )
}

const NoData = ({ what }: { what: string }) => <p className="muted">No {what} in this period.</p>

export function Reports() {
  const { data } = useStore()
  const openSheet = useAddSheet()
  const today = todayStr()
  const [mode, setMode] = useState<'day' | 'month' | 'year' | 'custom'>('day')
  const [cFrom, setCFrom] = useState(shiftDate(today, -29))
  const [cTo, setCTo] = useState(today)
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [personId, setPersonId] = useState('')

  const { gran, from, to } = useMemo((): { gran: Gran; from: string; to: string } => {
    if (mode === 'day') return { gran: 'day', from: shiftDate(today, -29), to: today }
    if (mode === 'month') {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - 11)
      return { gran: 'month', from: dateStr(d), to: today }
    }
    if (mode === 'year') {
      const min = data.transactions.reduce((m, t) => (t.date < m ? t.date : m), today)
      return { gran: 'year', from: `${yearOf(min)}-01-01`, to: today }
    }
    const f = cFrom <= cTo ? cFrom : cTo
    const t = cFrom <= cTo ? cTo : cFrom
    const days = (new Date(t).getTime() - new Date(f).getTime()) / 86400000
    return { gran: days <= 62 ? 'day' : days <= 740 ? 'month' : 'year', from: f, to: t }
  }, [mode, cFrom, cTo, today, data.transactions])

  const fmtKey = (k: string) => (gran === 'day' ? fmtDate(k) : gran === 'month' ? fmtMonthKey(k) : k)

  const f = {
    from,
    to,
    accountId: accountId || undefined,
    categoryId: categoryId || undefined,
  }
  const expenses = filterTxs(data.transactions, { ...f, types: ['expense'] })
  const incomes = filterTxs(data.transactions, { ...f, types: ['income'] })
  const spendSeries = seriesByPeriod(data, expenses, gran, from, to)
  const incomeSeries = seriesByPeriod(data, incomes, gran, from, to)
  const paired = spendSeries.map((p, i) => ({ key: p.key, a: incomeSeries[i]?.value ?? 0, b: p.value }))
  const catData = spendByCategoryTHB(data, f)
  const totalSpend = catData.reduce((s, c) => s + c.value, 0)
  const totalIncome = incomeSeries.reduce((s, p) => s + p.value, 0)

  const catOf = (id: string) =>
    data.categories.find((c) => c.id === id) ?? { name: 'Uncategorized', color: '#94A3B8', icon: '❔' }

  const fundSeries = [
    ...(data.funds.length > 1
      ? [{ label: 'Total', color: 'var(--savings)', points: fundGrowthTHB(data, 'all', gran, from, to) }]
      : []),
    ...data.funds.map((fd) => ({
      label: fd.name,
      color: fd.color,
      points: fundGrowthTHB(data, fd.id, gran, from, to),
    })),
  ]
  const hasSavings = data.transactions.some((t) => t.type === 'fund_contribute' || t.type === 'fund_withdraw')

  const balAccounts = accountId ? data.accounts.filter((a) => a.id === accountId) : data.accounts
  const balSeries = balAccounts.map((a) => ({
    label: a.name,
    color: a.color,
    points: balanceSeriesTHB(data, a.id, gran, from, to),
  }))

  const top = catData.slice(0, 3)
  const biggest = biggestExpenses(data, f, 5)
  const person = personId ? data.heldParties.find((p) => p.id === personId) : undefined

  const hasAny = data.transactions.length > 0

  return (
    <div className="screen screen-reports">
      <div className="screen-head">
        <h1>Reports</h1>
      </div>

      <Seg
        options={[
          { value: 'day', label: '30 days' },
          { value: 'month', label: '12 months' },
          { value: 'year', label: 'Years' },
          { value: 'custom', label: 'Custom' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'custom' && (
        <div className="grid2">
          <Field label="From">
            <input className="input" type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="grid3">
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Filter account">
          <option value="">All accounts</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter category">
          <option value="">All categories</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Filter person">
          <option value="">People…</option>
          {data.heldParties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {!hasAny ? (
        <EmptyState
          icon="📊"
          title="Nothing to chart yet"
          hint="Reports light up once you've recorded a few transactions."
        />
      ) : (
        <>
          <div className="card span2">
            <div className="grid3">
              <span className="col-sm" style={{ gap: 2 }}>
                <span className="xs muted">Income</span>
                <span className="money bold small amt-in">+{fmtTHB(totalIncome)}</span>
              </span>
              <span className="col-sm" style={{ gap: 2 }}>
                <span className="xs muted">Spending</span>
                <span className="money bold small amt-out">−{fmtTHB(totalSpend)}</span>
              </span>
              <span className="col-sm" style={{ gap: 2 }}>
                <span className="xs muted">Net</span>
                <span className={`money bold small ${totalIncome - totalSpend >= 0 ? 'amt-in' : 'amt-out'}`}>
                  {fmtTHB(totalIncome - totalSpend)}
                </span>
              </span>
            </div>
          </div>

          {person && (
            <Section title={`Held for ${person.name} over time`}>
              <Lines
                series={[{ label: person.name, color: '#D97706', points: heldGrowthTHB(data, person.id, gran, from, to) }]}
                fmtKey={fmtKey}
              />
            </Section>
          )}

          <Section title="Spending by category">
            {totalSpend === 0 ? (
              <NoData what="spending" />
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Donut
                    slices={catData.map((c) => ({ value: c.value, color: catOf(c.categoryId).color }))}
                    centerLabel="spent"
                    centerValue={fmtTHB(totalSpend)}
                  />
                </div>
                <div>
                  {catData.map((c) => {
                    const cat = catOf(c.categoryId)
                    return (
                      <div className="legend-row" key={c.categoryId}>
                        <span className="dot" style={{ background: cat.color }} />
                        <span className="nm">
                          {cat.icon} {cat.name}
                        </span>
                        <span className="money muted">{Math.round((c.value / totalSpend) * 100)}%</span>
                        <span className="money bold">{fmtTHB(c.value)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Section>

          <Section title="Spending over time">
            {totalSpend === 0 ? <NoData what="spending" /> : <Bars points={spendSeries} color="var(--expense)" fmtKey={fmtKey} />}
          </Section>

          <Section title="Income over time">
            {totalIncome === 0 ? <NoData what="income" /> : <Bars points={incomeSeries} color="var(--income)" fmtKey={fmtKey} />}
          </Section>

          <Section title="Income vs spending">
            {totalIncome === 0 && totalSpend === 0 ? (
              <NoData what="activity" />
            ) : (
              <>
                <PairedBars points={paired} colorA="var(--income)" colorB="var(--expense)" fmtKey={fmtKey} />
                <LegendChips
                  items={[
                    { label: 'Income', color: 'var(--income)' },
                    { label: 'Spending', color: 'var(--expense)' },
                  ]}
                />
              </>
            )}
          </Section>

          <Section title="Savings growth">
            {!hasSavings ? (
              <NoData what="savings" />
            ) : (
              <>
                <Lines series={fundSeries} fmtKey={fmtKey} />
                <LegendChips items={fundSeries.map((s) => ({ label: s.label, color: s.color }))} />
              </>
            )}
          </Section>

          <Section title="Account balance trends">
            <Lines series={balSeries} fmtKey={fmtKey} />
            <LegendChips items={balSeries.map((s) => ({ label: s.label, color: s.color }))} />
          </Section>

          {top.length > 0 && (
            <Section title="Top spending categories">
              <div className="wrap">
                {top.map((c, i) => {
                  const cat = catOf(c.categoryId)
                  return (
                    <span className="chip" key={c.categoryId}>
                      {['🥇', '🥈', '🥉'][i]} {cat.icon} {cat.name} · <b className="money">{fmtTHB(c.value)}</b>
                    </span>
                  )
                })}
              </div>
            </Section>
          )}

          {biggest.length > 0 && (
            <Section title="Biggest expenses">
              <div className="list" style={{ margin: 'calc(-1 * var(--sp-2))', marginTop: 0 }}>
                {biggest.map(({ tx }) => (
                  <TxRow key={tx.id} tx={tx} onClick={() => openSheet({ tx })} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
