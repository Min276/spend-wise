import { useState } from 'react'
import { useStore } from '../lib/store'
import { useAddSheet } from '../lib/sheet'
import { DEBT_TYPES, type HeldParty } from '../lib/types'
import { debtForPartyTHB, debtTotalTHB, filterTxs, lentForPartyTHB, lentTotalTHB } from '../lib/money'
import { fmtTHB } from '../lib/format'
import { navigate } from '../lib/router'
import { BackButton, EmptyState, RowIcon } from '../components/ui'
import { Icon } from '../components/Icons'
import { TxRow } from '../components/TxRow'
import { NameForm } from './Manage'
import { NotFound, PartyHead } from './Held'

const near0 = (n: number) => Math.abs(n) < 0.005

function PartyBalances({ owe, lent, big }: { owe: number; lent: number; big?: boolean }) {
  const size = big ? { fontSize: 'var(--fs-2xl)', fontWeight: 700 } : undefined
  return (
    <>
      {!near0(owe) && (
        <span className="col-sm" style={{ gap: 0 }}>
          {big && <span className="label" style={{ color: 'var(--debt)' }}>You owe</span>}
          <span className="money amt-debt bold" style={size}>
            {big ? fmtTHB(owe) : `−${fmtTHB(owe)}`}
          </span>
          {!big && <span className="xs muted">you owe</span>}
        </span>
      )}
      {!near0(lent) && (
        <span className="col-sm" style={{ gap: 0 }}>
          {big && <span className="label" style={{ color: 'var(--lent)' }}>Owed to you</span>}
          <span className="money amt-lent bold" style={size}>
            {fmtTHB(lent)}
          </span>
          {!big && <span className="xs muted">owed to you</span>}
        </span>
      )}
    </>
  )
}

function DebtButtons({ personId, owe, lent }: { personId?: string; owe: number; lent: number }) {
  const openSheet = useAddSheet()
  const go = (type: (typeof DEBT_TYPES)[number]) => openSheet({ preset: { type, personId } })
  return (
    <div className="grid2">
      <button className="btn btn-primary" onClick={() => go('borrow')}>
        I borrowed
      </button>
      <button className="btn btn-primary" onClick={() => go('lend')}>
        I lent
      </button>
      <button className="btn" disabled={owe <= 0.005} onClick={() => go('repay')}>
        I repaid
      </button>
      <button className="btn" disabled={lent <= 0.005} onClick={() => go('collect')}>
        Got paid back
      </button>
    </div>
  )
}

export function Debts() {
  const { data, addEntity } = useStore()
  const [adding, setAdding] = useState(false)

  const owe = debtTotalTHB(data)
  const lent = lentTotalTHB(data)
  const rows = data.heldParties
    .map((p) => ({
      p,
      owe: debtForPartyTHB(data, p.id),
      lent: lentForPartyTHB(data, p.id),
      records: filterTxs(data.transactions, { personId: p.id, types: DEBT_TYPES }).length,
    }))
    .filter((r) => r.records > 0)
    .sort((a, b) => Math.abs(b.owe) + Math.abs(b.lent) - (Math.abs(a.owe) + Math.abs(a.lent)))

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/more" />
          <h1>Debts & Loans</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Person
        </button>
      </div>

      <div className="card tint-debt col-sm">
        <div className="grid3">
          <span className="col-sm" style={{ gap: 2 }}>
            <span className="xs muted">I owe</span>
            <span className="money bold amt-debt">{fmtTHB(owe)}</span>
          </span>
          <span className="col-sm" style={{ gap: 2 }}>
            <span className="xs muted">Owed to me</span>
            <span className="money bold amt-lent">{fmtTHB(lent)}</span>
          </span>
          <span className="col-sm" style={{ gap: 2 }}>
            <span className="xs muted">Net</span>
            <span className={`money bold ${lent - owe >= 0 ? 'amt-in' : 'amt-out'}`}>{fmtTHB(lent - owe)}</span>
          </span>
        </div>
        <p className="small sub">
          Borrowed money is subtracted from “My money” until you repay it. Money you lent shows as owed to you and
          comes back into your balance when it’s repaid.
        </p>
      </div>

      <DebtButtons owe={owe} lent={lent} />

      {rows.length === 0 ? (
        <EmptyState
          icon="🤲"
          title="No debts or loans"
          hint="Record money you borrowed from someone, or money you lent to them."
        />
      ) : (
        <div className="list">
          {rows.map(({ p, owe: o, lent: l, records }) => (
            <button className="lrow" key={p.id} onClick={() => navigate(`/debts/${p.id}`)}>
              <RowIcon emoji={o > 0.005 ? '💳' : '🤲'} color={o > 0.005 ? '#E11D48' : '#0284C7'} />
              <span className="lrow-main">
                <span className="t">{p.name}</span>
                <span className="s">
                  {records} {records === 1 ? 'record' : 'records'}
                  {near0(o) && near0(l) ? ' · settled' : ''}
                </span>
              </span>
              <span className="lrow-right col-sm" style={{ gap: 2 }}>
                <PartyBalances owe={o} lent={l} />
              </span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      )}

      {adding && (
        <NameForm
          title="New person or organization"
          onSave={(name) => addEntity('heldParties', { name })}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

export function DebtHistory({ personId }: { personId: string }) {
  const { data } = useStore()
  const openSheet = useAddSheet()

  const person: HeldParty | undefined = data.heldParties.find((p) => p.id === personId)
  if (!person) return <NotFound backTo="/debts" />

  const owe = debtForPartyTHB(data, person.id)
  const lent = lentForPartyTHB(data, person.id)
  const history = filterTxs(data.transactions, { personId: person.id, types: DEBT_TYPES }).sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )

  return (
    <div className="screen">
      <PartyHead person={person} backTo="/debts" />

      <div className="card tint-debt col-sm">
        {near0(owe) && near0(lent) ? (
          <span className="small sub">All settled with {person.name} — nothing outstanding.</span>
        ) : (
          <PartyBalances owe={owe} lent={lent} big />
        )}
      </div>

      <DebtButtons personId={person.id} owe={owe} lent={lent} />

      <span className="label">Full history</span>
      {history.length === 0 ? (
        <EmptyState icon="🕓" title="No records yet" hint={`Record money borrowed from or lent to ${person.name}.`} />
      ) : (
        <div className="list">
          {history.map((tx) => (
            <TxRow key={tx.id} tx={tx} onClick={() => openSheet({ tx })} />
          ))}
        </div>
      )}
    </div>
  )
}
