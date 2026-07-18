import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import type { Account, Category, EntityKind, HeldParty, ID, IncomeSource } from '../lib/types'
import { heldForPartyTHB } from '../lib/money'
import { fmtTHB } from '../lib/format'
import { CHART_PALETTE } from '../lib/seed'
import { ConfirmDialog, Field, Overlay, RowIcon, Sheet, BackButton, parseAmount } from '../components/ui'
import { Icon } from '../components/Icons'

/* ---------- shared delete flow ---------- */

export function DeleteEntityDialog({
  kind,
  id,
  name,
  onClose,
}: {
  kind: EntityKind
  id: ID
  name: string
  onClose: () => void
}) {
  const { data, deleteEntity } = useStore()

  const refCount = useMemo(() => {
    if (kind === 'accounts')
      return data.transactions.filter((tx) => tx.accountId === id || tx.toAccountId === id).length
    const field = { incomeSources: 'sourceId', categories: 'categoryId', funds: 'fundId', heldParties: 'personId' }[kind] as
      | 'sourceId'
      | 'categoryId'
      | 'fundId'
      | 'personId'
    return data.transactions.filter((tx) => tx[field] === id).length
  }, [data.transactions, kind, id])

  const candidates = data[kind].filter((x) => x.id !== id)
  const [mode, setMode] = useState<'reassign' | 'delete'>(candidates.length ? 'reassign' : 'delete')
  const [target, setTarget] = useState<ID>(candidates[0]?.id ?? '')

  const heldBalance = kind === 'heldParties' ? heldForPartyTHB(data, id) : 0
  if (kind === 'heldParties' && Math.abs(heldBalance) > 0.005) {
    return (
      <Overlay onClose={onClose} center>
        <div className="dialog" role="alertdialog" aria-modal="true">
          <h3>Still holding their money</h3>
          <p className="sub">
            You are holding {fmtTHB(heldBalance)} for {name}. Record an “I returned money” entry to bring
            their balance to zero before deleting.
          </p>
          <button className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </Overlay>
    )
  }

  if (refCount === 0)
    return (
      <ConfirmDialog
        title={`Delete “${name}”?`}
        body="It has no recorded transactions."
        onConfirm={() => deleteEntity(kind, id)}
        onClose={onClose}
      />
    )

  return (
    <ConfirmDialog
      title={`Delete “${name}”?`}
      body={`${refCount} ${refCount === 1 ? 'record references' : 'records reference'} it.`}
      confirmLabel={mode === 'delete' ? 'Delete all' : 'Move & delete'}
      onConfirm={() => deleteEntity(kind, id, mode === 'reassign' ? target : undefined)}
      onClose={onClose}
    >
      {candidates.length > 0 && (
        <label className="radio-row">
          <input type="radio" checked={mode === 'reassign'} onChange={() => setMode('reassign')} />
          <span>Move records to</span>
          <select
            className="input"
            style={{ minHeight: 36, flex: 1 }}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={mode !== 'reassign'}
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {(c as { name: string }).name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="radio-row">
        <input type="radio" checked={mode === 'delete'} onChange={() => setMode('delete')} />
        <span>Delete the {refCount} {refCount === 1 ? 'record' : 'records'} too</span>
      </label>
    </ConfirmDialog>
  )
}

/* ---------- small form bits ---------- */

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {CHART_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${value === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  )
}

const CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'MMK', 'AUD']

/* ---------- accounts ---------- */

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { addEntity, updateEntity } = useStore()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'Bank')
  const [icon, setIcon] = useState(account?.icon ?? '🏦')
  const [color, setColor] = useState(account?.color ?? CHART_PALETTE[0]!)
  const [currency, setCurrency] = useState(account?.currency ?? 'THB')
  const [fxStr, setFxStr] = useState(account ? String(account.fxRateToTHB) : '1')

  const save = () => {
    const item = {
      name: name.trim(),
      type: type.trim(),
      icon: icon.trim() || '🏦',
      color,
      currency: currency.trim().toUpperCase() || 'THB',
      fxRateToTHB: currency === 'THB' ? 1 : parseAmount(fxStr) || 1,
    }
    if (account) updateEntity('accounts', { ...account, ...item })
    else addEntity('accounts', item)
    onClose()
  }

  return (
    <Sheet title={account ? 'Edit account' : 'New account'} onClose={onClose}>
      <div className="grid2">
        <Field label="Name">
          <input className="input" value={name} autoFocus={!account} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <input className="input" value={type} onChange={(e) => setType(e.target.value)} placeholder="Bank, E-wallet…" />
        </Field>
        <Field label="Icon (emoji)">
          <input className="input" value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} />
        </Field>
        <Field label="Currency">
          <input
            className="input"
            list="currency-list"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </Field>
      </div>
      <datalist id="currency-list">
        {CURRENCIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {currency !== 'THB' && (
        <Field label={`FX rate — 1 ${currency || '?'} = ? ฿`}>
          <input
            className="input"
            inputMode="decimal"
            value={fxStr}
            onChange={(e) => /^[\d,]*\.?\d*$/.test(e.target.value) && setFxStr(e.target.value)}
          />
        </Field>
      )}
      <Field label="Color">
        <Swatches value={color} onChange={setColor} />
      </Field>
      <button className="btn btn-primary btn-full" disabled={!name.trim()} onClick={save}>
        Save
      </button>
    </Sheet>
  )
}

export function ManageAccounts() {
  const { data } = useStore()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)
  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/settings" />
          <h1>Accounts</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      <div className="list">
        {data.accounts.map((a) => (
          <div className="lrow" key={a.id}>
            <RowIcon emoji={a.icon} color={a.color} />
            <button className="lrow-main" style={{ textAlign: 'left' }} onClick={() => setEditing(a)}>
              <span className="t">{a.name}</span>
              <span className="s">
                {a.type} · {a.currency}
                {a.currency !== 'THB' ? ` · 1 ${a.currency} = ฿${a.fxRateToTHB}` : ''}
              </span>
            </button>
            <button className="btn-icon" onClick={() => setDeleting(a)} aria-label={`Delete ${a.name}`}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>
      <p className="muted">
        Balances are always computed from transactions. To adjust a balance, record an income, expense, or
        transfer.
      </p>
      {editing && (
        <AccountForm account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <DeleteEntityDialog kind="accounts" id={deleting.id} name={deleting.name} onClose={() => setDeleting(null)} />
      )}
    </div>
  )
}

/* ---------- categories ---------- */

function CategoryForm({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { addEntity, updateEntity } = useStore()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '🏷️')
  const [color, setColor] = useState(category?.color ?? CHART_PALETTE[0]!)
  const save = () => {
    const item = { name: name.trim(), icon: icon.trim() || '🏷️', color }
    if (category) updateEntity('categories', { ...category, ...item })
    else addEntity('categories', item)
    onClose()
  }
  return (
    <Sheet title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <div className="grid2">
        <Field label="Name">
          <input className="input" value={name} autoFocus={!category} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Icon (emoji)">
          <input className="input" value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} />
        </Field>
      </div>
      <Field label="Color">
        <Swatches value={color} onChange={setColor} />
      </Field>
      <button className="btn btn-primary btn-full" disabled={!name.trim()} onClick={save}>
        Save
      </button>
    </Sheet>
  )
}

export function ManageCategories() {
  const { data } = useStore()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/settings" />
          <h1>Categories</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      <div className="list">
        {data.categories.map((c) => (
          <div className="lrow" key={c.id}>
            <RowIcon emoji={c.icon} color={c.color} />
            <button className="lrow-main" style={{ textAlign: 'left' }} onClick={() => setEditing(c)}>
              <span className="t">{c.name}</span>
            </button>
            <button className="btn-icon" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <CategoryForm category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <DeleteEntityDialog kind="categories" id={deleting.id} name={deleting.name} onClose={() => setDeleting(null)} />
      )}
    </div>
  )
}

/* ---------- simple named lists (sources & people) ---------- */

export function NameForm({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string
  initial?: string
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial ?? '')
  const save = () => {
    if (!name.trim()) return
    onSave(name.trim())
    onClose()
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <Field label="Name">
        <input
          className="input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </Field>
      <button className="btn btn-primary btn-full" disabled={!name.trim()} onClick={save}>
        Save
      </button>
    </Sheet>
  )
}

export function ManageSources() {
  const { data, addEntity, updateEntity } = useStore()
  const [editing, setEditing] = useState<IncomeSource | 'new' | null>(null)
  const [deleting, setDeleting] = useState<IncomeSource | null>(null)
  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/settings" />
          <h1>Income sources</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      <div className="list">
        {data.incomeSources.map((s) => (
          <div className="lrow" key={s.id}>
            <RowIcon emoji="💵" color="#059669" />
            <button className="lrow-main" style={{ textAlign: 'left' }} onClick={() => setEditing(s)}>
              <span className="t">{s.name}</span>
            </button>
            <button className="btn-icon" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <NameForm
          title={editing === 'new' ? 'New income source' : 'Rename source'}
          initial={editing === 'new' ? undefined : editing.name}
          onSave={(name) =>
            editing === 'new'
              ? addEntity('incomeSources', { name })
              : updateEntity('incomeSources', { ...editing, name })
          }
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteEntityDialog
          kind="incomeSources"
          id={deleting.id}
          name={deleting.name}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

export function ManagePeople() {
  const { data, addEntity, updateEntity } = useStore()
  const [editing, setEditing] = useState<HeldParty | 'new' | null>(null)
  const [deleting, setDeleting] = useState<HeldParty | null>(null)
  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/settings" />
          <h1>People (held funds)</h1>
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      <div className="list">
        {data.heldParties.map((p) => (
          <div className="lrow" key={p.id}>
            <RowIcon emoji="🤝" color="#D97706" />
            <button className="lrow-main" style={{ textAlign: 'left' }} onClick={() => setEditing(p)}>
              <span className="t">{p.name}</span>
              <span className="s money">{fmtTHB(heldForPartyTHB(data, p.id))} held</span>
            </button>
            <button className="btn-icon" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <NameForm
          title={editing === 'new' ? 'New person' : 'Rename person'}
          initial={editing === 'new' ? undefined : editing.name}
          onSave={(name) =>
            editing === 'new'
              ? addEntity('heldParties', { name })
              : updateEntity('heldParties', { ...editing, name })
          }
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteEntityDialog
          kind="heldParties"
          id={deleting.id}
          name={deleting.name}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
