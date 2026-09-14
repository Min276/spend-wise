import { useState } from 'react'
import { useStore } from '../lib/store'
import { DEBT_TYPES, type ID, type Tx, type TxType } from '../lib/types'
import { todayStr } from '../lib/money'
import { fmtMoney, fmtTHB, symbolOf } from '../lib/format'
import { AmountInput, ConfirmDialog, Field, parseAmount, Seg, Sheet } from './ui'
import { Icon } from './Icons'

export interface SheetOpts {
  tx?: Tx
  preset?: Partial<Tx>
}

type Kind = 'expense' | 'income' | 'transfer' | 'fund' | 'held' | 'debt'
type DebtType = 'borrow' | 'repay' | 'lend' | 'collect'

const isDebt = (t: TxType): t is DebtType => DEBT_TYPES.includes(t)

const kindOf = (t: TxType): Kind =>
  t === 'fund_contribute' || t === 'fund_withdraw'
    ? 'fund'
    : t === 'held_add' || t === 'held_reduce'
      ? 'held'
      : isDebt(t)
        ? 'debt'
        : t

interface ChipItem {
  id: ID
  label: string
  icon?: string
  color?: string
}

function ChipPick({
  items,
  value,
  onChange,
  onNew,
}: {
  items: ChipItem[]
  value: ID
  onChange: (id: ID) => void
  onNew?: (name: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const create = () => {
    const n = name.trim()
    if (n && onNew) onNew(n)
    setAdding(false)
    setName('')
  }
  return (
    <div className="wrap">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`chip ${it.id === value ? 'on' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.color && <span className="dot" style={{ background: it.color }} />}
          {it.icon && <span aria-hidden>{it.icon}</span>}
          {it.label}
        </button>
      ))}
      {onNew &&
        (adding ? (
          <span className="rowx" style={{ gap: 'var(--sp-1)' }}>
            <input
              className="input"
              style={{ minHeight: 32, width: 140, padding: '0 10px' }}
              placeholder="Name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button type="button" className="btn btn-sm btn-primary" onClick={create}>
              Add
            </button>
          </span>
        ) : (
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            + New
          </button>
        ))}
    </div>
  )
}

export function AddSheet({ opts, onClose }: { opts: SheetOpts; onClose: () => void }) {
  const { data, addTx, updateTx, deleteTx, addEntity, addTemplate } = useStore()
  const tx = opts.tx
  const init = tx ?? opts.preset

  const [kind, setKind] = useState<Kind>(init?.type ? kindOf(init.type) : 'expense')
  const [dir, setDir] = useState<'in' | 'out'>(
    init?.type === 'fund_withdraw' || init?.type === 'held_reduce' ? 'out' : 'in',
  )
  const [debtType, setDebtType] = useState<DebtType>(init?.type && isDebt(init.type) ? init.type : 'borrow')
  const [amountStr, setAmountStr] = useState(init?.amount ? String(init.amount) : '')
  const [toAmountStr, setToAmountStr] = useState(tx?.toAmount ? String(tx.toAmount) : '')
  const [accountId, setAccountId] = useState<ID>(
    init?.accountId ?? data.settings.lastUsedAccountId ?? data.accounts[0]?.id ?? '',
  )
  const [toAccountId, setToAccountId] = useState<ID>(tx?.toAccountId ?? '')
  const [categoryId, setCategoryId] = useState<ID>(init?.categoryId ?? '')
  const [sourceId, setSourceId] = useState<ID>(init?.sourceId ?? data.incomeSources[0]?.id ?? '')
  const [fundId, setFundId] = useState<ID>(init?.fundId ?? data.funds[0]?.id ?? '')
  const [personId, setPersonId] = useState<ID>(init?.personId ?? data.heldParties[0]?.id ?? '')
  const [date, setDate] = useState(init?.date ?? todayStr())
  const [note, setNote] = useState(init?.note ?? '')
  const [recurring, setRecurring] = useState(!!init?.recurring)
  const [confirmDel, setConfirmDel] = useState(false)
  const [savingTpl, setSavingTpl] = useState(false)
  const [tplLabel, setTplLabel] = useState('')

  const acc = data.accounts.find((a) => a.id === accountId)
  const toAcc = data.accounts.find((a) => a.id === toAccountId)
  const amount = parseAmount(amountStr)
  const cross = kind === 'transfer' && !!acc && !!toAcc && acc.currency !== toAcc.currency
  const suggestedTo = cross && acc && toAcc ? (amount * acc.fxRateToTHB) / (toAcc.fxRateToTHB || 1) : 0

  const txType: TxType =
    kind === 'fund'
      ? dir === 'in'
        ? 'fund_contribute'
        : 'fund_withdraw'
      : kind === 'held'
        ? dir === 'in'
          ? 'held_add'
          : 'held_reduce'
        : kind === 'debt'
          ? debtType
          : kind
  const withParty = kind === 'held' || kind === 'debt'

  const valid =
    amount > 0 &&
    !!accountId &&
    !!date &&
    (kind !== 'expense' || !!categoryId) &&
    (kind !== 'income' || !!sourceId) &&
    (kind !== 'transfer' || (!!toAccountId && toAccountId !== accountId)) &&
    (kind !== 'fund' || !!fundId) &&
    (!withParty || !!personId)

  const buildFields = () => ({
    type: txType,
    amount,
    date,
    accountId,
    note: note.trim() || undefined,
    categoryId: kind === 'expense' ? categoryId : undefined,
    sourceId: kind === 'income' ? sourceId : undefined,
    recurring: kind === 'income' && recurring ? true : undefined,
    toAccountId: kind === 'transfer' ? toAccountId : undefined,
    toAmount: cross ? parseAmount(toAmountStr) || suggestedTo : undefined,
    fundId: kind === 'fund' ? fundId : undefined,
    personId: withParty ? personId : undefined,
  })

  const save = () => {
    const fields = buildFields()
    if (tx) updateTx({ ...tx, ...fields })
    else addTx(fields)
    onClose()
  }

  const saveTemplate = () => {
    // date is set fresh each time the template is used, so drop it here.
    const preset = { ...buildFields(), date: undefined }
    addTemplate({ label: tplLabel.trim(), preset })
    setSavingTpl(false)
    setTplLabel('')
  }

  const accountChips = data.accounts.map((a) => ({ id: a.id, label: a.name, icon: a.icon }))

  return (
    <Sheet title={tx ? 'Edit entry' : 'Add entry'} onClose={onClose}>
      <Seg
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfer' },
          { value: 'fund', label: 'Save' },
          { value: 'held', label: 'Held' },
          { value: 'debt', label: 'Debt' },
        ]}
        value={kind}
        onChange={setKind}
      />

      <div className="col-sm">
        <AmountInput
          value={amountStr}
          onChange={setAmountStr}
          symbol={symbolOf(acc?.currency ?? 'THB')}
          autoFocus={!tx}
        />
        {acc && acc.currency !== 'THB' && amount > 0 && (
          <span className="muted">≈ {fmtTHB(amount * acc.fxRateToTHB)} at rate {acc.fxRateToTHB}</span>
        )}
      </div>

      {kind === 'expense' && (
        <Field label="Category">
          <ChipPick
            items={data.categories.map((c) => ({ id: c.id, label: c.name, icon: c.icon, color: c.color }))}
            value={categoryId}
            onChange={setCategoryId}
          />
        </Field>
      )}

      {kind === 'income' && (
        <Field label="Income source">
          <ChipPick
            items={data.incomeSources.map((s) => ({ id: s.id, label: s.name }))}
            value={sourceId}
            onChange={setSourceId}
            onNew={(name) => setSourceId(addEntity('incomeSources', { name }))}
          />
        </Field>
      )}

      {kind === 'fund' && (
        <>
          <Seg
            options={[
              { value: 'in', label: 'Add to fund' },
              { value: 'out', label: 'Withdraw' },
            ]}
            value={dir}
            onChange={setDir}
          />
          <Field label="Fund">
            <ChipPick
              items={data.funds.map((f) => ({ id: f.id, label: f.name, icon: f.icon, color: f.color }))}
              value={fundId}
              onChange={setFundId}
            />
          </Field>
        </>
      )}

      {kind === 'held' && (
        <>
          <Seg
            options={[
              { value: 'in', label: 'They sent money' },
              { value: 'out', label: 'I returned money' },
            ]}
            value={dir}
            onChange={setDir}
          />
          <Field label="Whose money?">
            <ChipPick
              items={data.heldParties.map((p) => ({ id: p.id, label: p.name }))}
              value={personId}
              onChange={setPersonId}
              onNew={(name) => setPersonId(addEntity('heldParties', { name }))}
            />
          </Field>
        </>
      )}

      {kind === 'debt' && (
        <>
          <Seg
            options={[
              { value: 'borrow', label: 'I borrowed' },
              { value: 'repay', label: 'I repaid' },
              { value: 'lend', label: 'I lent' },
              { value: 'collect', label: 'Got back' },
            ]}
            value={debtType}
            onChange={setDebtType}
          />
          <Field label={debtType === 'borrow' || debtType === 'repay' ? 'Who lent it? (person / organization)' : 'Who owes you?'}>
            <ChipPick
              items={data.heldParties.map((p) => ({ id: p.id, label: p.name }))}
              value={personId}
              onChange={setPersonId}
              onNew={(name) => setPersonId(addEntity('heldParties', { name }))}
            />
          </Field>
        </>
      )}

      <Field
        label={
          kind === 'transfer' || txType === 'repay' || txType === 'lend'
            ? 'From account'
            : kind === 'income' || txType === 'borrow' || txType === 'collect'
              ? 'Into account'
              : 'Account'
        }
      >
        <ChipPick items={accountChips} value={accountId} onChange={setAccountId} />
      </Field>

      {kind === 'transfer' && (
        <>
          <Field label="To account">
            <ChipPick
              items={accountChips.filter((a) => a.id !== accountId)}
              value={toAccountId}
              onChange={setToAccountId}
            />
          </Field>
          {cross && toAcc && (
            <Field label={`Amount received (${toAcc.currency})`}>
              <AmountInput
                value={toAmountStr}
                onChange={setToAmountStr}
                symbol={symbolOf(toAcc.currency)}
                placeholder={suggestedTo ? suggestedTo.toFixed(2) : '0'}
              />
            </Field>
          )}
        </>
      )}

      <div className="grid2">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <input
            className="input"
            placeholder="Add a note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      {kind === 'income' && (
        <button
          type="button"
          className={`chip ${recurring ? 'on' : ''}`}
          onClick={() => setRecurring(!recurring)}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icon name="repeat" size={14} /> Recurring
        </button>
      )}

      <button className="btn btn-primary btn-full" disabled={!valid} onClick={save}>
        {tx ? 'Save changes' : 'Save'}
      </button>

      {!tx &&
        valid &&
        (savingTpl ? (
          <div className="rowx" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="Template name"
              value={tplLabel}
              autoFocus
              onChange={(e) => setTplLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && tplLabel.trim() && saveTemplate()}
            />
            <button type="button" className="btn btn-sm btn-primary" disabled={!tplLabel.trim()} onClick={saveTemplate}>
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setSavingTpl(true)}
          >
            <Icon name="repeat" size={14} /> Save as template
          </button>
        ))}

      {tx && (
        <button className="btn btn-ghost btn-full" style={{ color: 'var(--expense)' }} onClick={() => setConfirmDel(true)}>
          <Icon name="trash" size={18} /> Delete entry
        </button>
      )}

      {confirmDel && tx && (
        <ConfirmDialog
          title="Delete this entry?"
          body={`${fmtMoney(tx.amount, acc?.currency)} on ${tx.date}. This cannot be undone.`}
          onConfirm={() => {
            deleteTx(tx.id)
            onClose()
          }}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </Sheet>
  )
}
