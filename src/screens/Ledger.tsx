import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useAddSheet } from '../lib/sheet'
import type { ID, Tx, TxType } from '../lib/types'
import { byId, filterTxs, toTHB } from '../lib/money'
import { fmtDate, fmtTHB } from '../lib/format'
import { TxRow } from '../components/TxRow'
import { EmptyState, Field } from '../components/ui'
import { Icon } from '../components/Icons'

const TYPE_CHIPS: { key: string; label: string; types?: TxType[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses', types: ['expense'] },
  { key: 'income', label: 'Income', types: ['income'] },
  { key: 'transfer', label: 'Transfers', types: ['transfer'] },
  { key: 'fund', label: 'Savings', types: ['fund_contribute', 'fund_withdraw'] },
  { key: 'held', label: 'Held', types: ['held_add', 'held_reduce'] },
]

export function Ledger() {
  const { data } = useStore()
  const openSheet = useAddSheet()
  const [q, setQ] = useState('')
  const [typeKey, setTypeKey] = useState('all')
  const [accountId, setAccountId] = useState<ID | ''>('')
  const [categoryId, setCategoryId] = useState<ID | ''>('')
  const [personId, setPersonId] = useState<ID | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<'new' | 'old' | 'big'>('new')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const filtered = useMemo(() => {
    const accounts = byId(data.accounts)
    const cats = byId(data.categories)
    const srcs = byId(data.incomeSources)
    const funds = byId(data.funds)
    const people = byId(data.heldParties)

    let txs = filterTxs(data.transactions, {
      types: TYPE_CHIPS.find((t) => t.key === typeKey)?.types,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      personId: personId || undefined,
      from: from || undefined,
      to: to || undefined,
    })

    const needle = q.trim().toLowerCase()
    if (needle) {
      txs = txs.filter((tx) => {
        const label = [
          tx.note,
          String(tx.amount),
          cats.get(tx.categoryId ?? '')?.name,
          srcs.get(tx.sourceId ?? '')?.name,
          funds.get(tx.fundId ?? '')?.name,
          people.get(tx.personId ?? '')?.name,
          accounts.get(tx.accountId)?.name,
          accounts.get(tx.toAccountId ?? '')?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return label.includes(needle)
      })
    }

    const sorted = [...txs]
    if (sort === 'big') {
      sorted.sort(
        (a, b) => toTHB(b.amount, accounts.get(b.accountId)) - toTHB(a.amount, accounts.get(a.accountId)),
      )
    } else {
      sorted.sort((a, b) =>
        sort === 'new'
          ? b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
          : a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
      )
    }
    return sorted
  }, [data, q, typeKey, accountId, categoryId, personId, from, to, sort])

  const groups = useMemo(() => {
    if (sort === 'big') return null
    const accounts = byId(data.accounts)
    const out: { date: string; txs: Tx[]; spent: number }[] = []
    for (const tx of filtered) {
      let g = out[out.length - 1]
      if (!g || g.date !== tx.date) {
        g = { date: tx.date, txs: [], spent: 0 }
        out.push(g)
      }
      g.txs.push(tx)
      if (tx.type === 'expense') g.spent += toTHB(tx.amount, accounts.get(tx.accountId))
    }
    return out
  }, [filtered, sort, data.accounts])

  const hasAny = data.transactions.length > 0
  const hasFilter = q || typeKey !== 'all' || accountId || categoryId || personId || from || to

  const clearFilters = () => {
    setQ('')
    setTypeKey('all')
    setAccountId('')
    setCategoryId('')
    setPersonId('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Ledger</h1>
        <span className="muted">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
      </div>

      <input
        className="input"
        placeholder="Search notes, names, amounts…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search transactions"
      />

      <div className="chip-row">
        {TYPE_CHIPS.map((t) => (
          <button
            key={t.key}
            className={`chip ${typeKey === t.key ? 'on' : ''}`}
            onClick={() => setTypeKey(t.key)}
          >
            {t.label}
          </button>
        ))}
        <button className={`chip ${filtersOpen || hasFilter ? 'on' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)}>
          <Icon name="filter" size={13} /> Filters
        </button>
      </div>

      {filtersOpen && (
        <div className="card col-sm">
          <div className="grid2">
            <Field label="Account">
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">All accounts</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All categories</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Person">
              <select className="input" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Anyone</option>
                {data.heldParties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Sort">
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="new">Newest first</option>
                <option value="old">Oldest first</option>
                <option value="big">Largest first</option>
              </select>
            </Field>
            <Field label="From">
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          {hasFilter && (
            <button className="btn btn-ghost" onClick={clearFilters}>
              Clear all filters
            </button>
          )}
        </div>
      )}

      {!hasAny ? (
        <EmptyState
          icon="🧾"
          title="No transactions yet"
          hint="Tap the + button to record your first income or expense."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nothing matches"
          hint="Try different keywords or clear the filters."
          action={
            <button className="btn" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      ) : groups ? (
        groups.map((g) => (
          <div key={g.date}>
            <div className="day-head">
              <span>{fmtDate(g.date)}</span>
              {g.spent > 0 && <span className="money amt-out">−{fmtTHB(g.spent)}</span>}
            </div>
            <div className="list">
              {g.txs.map((tx) => (
                <TxRow key={tx.id} tx={tx} onClick={() => openSheet({ tx })} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="list">
          {filtered.map((tx) => (
            <TxRow key={tx.id} tx={tx} onClick={() => openSheet({ tx })} />
          ))}
        </div>
      )}
    </div>
  )
}
