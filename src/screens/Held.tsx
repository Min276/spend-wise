import { useState } from 'react'
import { useStore } from '../lib/store'
import { useAddSheet } from '../lib/sheet'
import type { HeldParty } from '../lib/types'
import {
  accountRaw,
  filterTxs,
  heldForPartyTHB,
  heldInAccount,
  heldPartyInAccount,
  heldTotalTHB,
  spendable,
} from '../lib/money'
import { fmtMoney, fmtTHB } from '../lib/format'
import { navigate } from '../lib/router'
import { BackButton, EmptyState, RowIcon } from '../components/ui'
import { Icon } from '../components/Icons'
import { TxRow } from '../components/TxRow'
import { DeleteEntityDialog, NameForm } from './Manage'

function Reconciliation() {
  const { data } = useStore()
  const aunt = data.heldParties.find((p) => p.isPrimary)
  const withHeld = data.accounts.filter((a) => Math.abs(heldInAccount(data.transactions, a.id)) > 0.005)
  if (withHeld.length === 0) return null
  return (
    <div className="card col-sm">
      <span className="label">Reconciliation</span>
      {withHeld.map((acc) => {
        const raw = accountRaw(data.transactions, acc.id)
        const auntHere = aunt ? heldPartyInAccount(data.transactions, aunt.id, acc.id) : 0
        const othersHere = heldInAccount(data.transactions, acc.id) - auntHere
        return (
          <div key={acc.id} className="recon">
            <div className="recon-row">
              <span>
                Raw {acc.name} {acc.icon}
              </span>
              <span className="money">{fmtMoney(raw, acc.currency)}</span>
            </div>
            {Math.abs(auntHere) > 0.005 && (
              <div className="recon-row">
                <span className="amt-held">− {aunt!.name}</span>
                <span className="money amt-held">{fmtMoney(auntHere, acc.currency)}</span>
              </div>
            )}
            {Math.abs(othersHere) > 0.005 && (
              <div className="recon-row">
                <span className="amt-held">− Others</span>
                <span className="money amt-held">{fmtMoney(othersHere, acc.currency)}</span>
              </div>
            )}
            <div className="recon-row total">
              <span>= My money in {acc.name}</span>
              <span className="money">{fmtMoney(spendable(data.transactions, acc.id), acc.currency)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Held() {
  const { data, addEntity } = useStore()
  const openSheet = useAddSheet()
  const [adding, setAdding] = useState(false)

  const aunt = data.heldParties.find((p) => p.isPrimary)
  const others = data.heldParties.filter((p) => !p.isPrimary)
  const auntTotal = aunt ? heldForPartyTHB(data, aunt.id) : 0
  const othersWithTotals = others.map((p) => ({ p, total: heldForPartyTHB(data, p.id) }))
  const othersTotal = othersWithTotals.reduce((s, o) => s + o.total, 0)
  const activeOthers = othersWithTotals.filter((o) => o.total > 0.005).length
  const grand = heldTotalTHB(data)
  const records = (p: HeldParty) => filterTxs(data.transactions, { personId: p.id }).length

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/more" />
          <h1>Held for Others</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Person
        </button>
      </div>

      <div className="card tint-held col-sm">
        <span className="rowx">
          <span style={{ fontSize: 24 }} aria-hidden>
            🤝
          </span>
          <span className="small">
            This money is <b>not yours</b> — it never counts toward your income or net worth.
          </span>
        </span>
        <p className="small">
          You are holding <b className="money">{fmtTHB(auntTotal)}</b> for {aunt?.name ?? 'Aunt'} and{' '}
          <b className="money">{fmtTHB(othersTotal)}</b> for others ({activeOthers}{' '}
          {activeOthers === 1 ? 'person' : 'people'}).
        </p>
        <div className="spread">
          <span className="label" style={{ color: 'var(--held)' }}>
            Total to return
          </span>
          <span className="money amt-held" style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>
            {fmtTHB(grand)}
          </span>
        </div>
      </div>

      <div className="grid2">
        <button
          className="btn btn-primary"
          onClick={() => openSheet({ preset: { type: 'held_add' } })}
          disabled={data.heldParties.length === 0}
        >
          They sent money
        </button>
        <button
          className="btn"
          onClick={() => openSheet({ preset: { type: 'held_reduce' } })}
          disabled={grand <= 0}
        >
          I returned money
        </button>
      </div>

      <Reconciliation />

      {data.heldParties.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="Nobody yet"
          hint="Add a person whose money you sometimes hold."
          action={
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Add person
            </button>
          }
        />
      ) : (
        <div className="list">
          {[...(aunt ? [aunt] : []), ...others.sort((a, b) => heldForPartyTHB(data, b.id) - heldForPartyTHB(data, a.id))].map(
            (p) => (
              <button className="lrow" key={p.id} onClick={() => navigate(`/held/${p.id}`)}>
                <RowIcon emoji="🤝" color="#D97706" />
                <span className="lrow-main">
                  <span className="t">
                    {p.name}
                    {p.isPrimary ? ' ⭐' : ''}
                  </span>
                  <span className="s">
                    {records(p)} {records(p) === 1 ? 'record' : 'records'}
                  </span>
                </span>
                <span className="lrow-right">
                  <span className="t money amt-held">{fmtTHB(heldForPartyTHB(data, p.id))}</span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ),
          )}
        </div>
      )}

      {adding && (
        <NameForm
          title="New person"
          onSave={(name) => addEntity('heldParties', { name })}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

export function HeldHistory({ personId }: { personId: string }) {
  const { data, updateEntity } = useStore()
  const openSheet = useAddSheet()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const person = data.heldParties.find((p) => p.id === personId)
  if (!person)
    return (
      <div className="screen">
        <div className="screen-head">
          <span className="rowx">
            <BackButton to="/held" />
            <h1>Not found</h1>
          </span>
        </div>
      </div>
    )

  const total = heldForPartyTHB(data, person.id)
  const history = filterTxs(data.transactions, { personId: person.id }).sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/held" />
          <h1>{person.name}</h1>
        </span>
        <span className="rowx" style={{ gap: 4 }}>
          <button className="btn-icon" onClick={() => setRenaming(true)} aria-label="Rename">
            <Icon name="pencil" size={18} />
          </button>
          <button className="btn-icon" onClick={() => setDeleting(true)} aria-label="Delete">
            <Icon name="trash" size={18} />
          </button>
        </span>
      </div>

      <div className="card tint-held col-sm">
        <span className="label" style={{ color: 'var(--held)' }}>
          Currently holding for {person.name}
        </span>
        <span className="money amt-held" style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700 }}>
          {fmtTHB(total)}
        </span>
      </div>

      <div className="grid2">
        <button className="btn btn-primary" onClick={() => openSheet({ preset: { type: 'held_add', personId: person.id } })}>
          They sent money
        </button>
        <button
          className="btn"
          disabled={total <= 0}
          onClick={() => openSheet({ preset: { type: 'held_reduce', personId: person.id } })}
        >
          I returned money
        </button>
      </div>

      <span className="label">Full history</span>
      {history.length === 0 ? (
        <EmptyState icon="🕓" title="No records yet" hint={`Add an entry when ${person.name} sends money.`} />
      ) : (
        <div className="list">
          {history.map((tx) => (
            <TxRow key={tx.id} tx={tx} onClick={() => openSheet({ tx })} />
          ))}
        </div>
      )}

      {renaming && (
        <NameForm
          title="Rename person"
          initial={person.name}
          onSave={(name) => updateEntity('heldParties', { ...person, name })}
          onClose={() => setRenaming(false)}
        />
      )}
      {deleting && (
        <DeleteEntityDialog kind="heldParties" id={person.id} name={person.name} onClose={() => setDeleting(false)} />
      )}
    </div>
  )
}
