import { useStore } from '../lib/store'
import type { Tx } from '../lib/types'
import { toTHB } from '../lib/money'
import { displayCurrency, fmtDate, fmtMoney, fmtTHB } from '../lib/format'
import { RowIcon } from './ui'

export function TxRow({ tx, onClick }: { tx: Tx; onClick?: () => void }) {
  const { data } = useStore()
  const acc = data.accounts.find((a) => a.id === tx.accountId)
  const cur = acc?.currency ?? 'THB'

  let icon = '💵'
  let color: string | undefined
  let title = ''
  let sub = acc?.name ?? ''
  let amountText = fmtMoney(tx.amount, cur)
  let amountCls = 'amt-neutral'

  switch (tx.type) {
    case 'expense': {
      const cat = data.categories.find((c) => c.id === tx.categoryId)
      icon = cat?.icon ?? '🧾'
      color = cat?.color
      title = cat?.name ?? 'Expense'
      amountText = '−' + fmtMoney(tx.amount, cur)
      amountCls = 'amt-out'
      break
    }
    case 'income': {
      const src = data.incomeSources.find((s) => s.id === tx.sourceId)
      icon = '💵'
      color = '#059669'
      title = src?.name ?? 'Income'
      amountText = '+' + fmtMoney(tx.amount, cur)
      amountCls = 'amt-in'
      break
    }
    case 'transfer': {
      const to = data.accounts.find((a) => a.id === tx.toAccountId)
      icon = '🔁'
      color = '#0D9488'
      title = `${acc?.name ?? '?'} → ${to?.name ?? '?'}`
      sub = 'Transfer'
      break
    }
    case 'fund_contribute':
    case 'fund_withdraw': {
      const fund = data.funds.find((f) => f.id === tx.fundId)
      icon = fund?.icon ?? '🎯'
      color = fund?.color ?? '#4F46E5'
      const out = tx.type === 'fund_withdraw'
      title = fund?.name ?? 'Fund'
      sub = out ? `Withdrawn · ${sub}` : `Saved · ${sub}`
      amountText = (out ? '−' : '+') + fmtMoney(tx.amount, cur)
      amountCls = 'amt-sav'
      break
    }
    case 'held_add':
    case 'held_reduce': {
      const person = data.heldParties.find((p) => p.id === tx.personId)
      icon = '🤝'
      color = '#D97706'
      const out = tx.type === 'held_reduce'
      title = out ? `Returned to ${person?.name ?? '?'}` : `Holding for ${person?.name ?? '?'}`
      amountText = (out ? '−' : '+') + fmtMoney(tx.amount, cur)
      amountCls = 'amt-held'
      break
    }
    case 'borrow':
    case 'repay':
    case 'lend':
    case 'collect': {
      const name = data.heldParties.find((p) => p.id === tx.personId)?.name ?? '?'
      const debt = tx.type === 'borrow' || tx.type === 'repay'
      icon = debt ? '💳' : '🤲'
      color = debt ? '#E11D48' : '#0284C7'
      title = { borrow: `Borrowed from ${name}`, repay: `Repaid ${name}`, lend: `Lent to ${name}`, collect: `${name} paid back` }[tx.type]
      const out = tx.type === 'repay' || tx.type === 'lend'
      amountText = (out ? '−' : '+') + fmtMoney(tx.amount, cur)
      amountCls = debt ? 'amt-debt' : 'amt-lent'
      break
    }
  }

  if (tx.origCurrency && tx.origAmount) sub += ` · ${fmtMoney(tx.origAmount, tx.origCurrency)}`
  if (tx.note) sub += ` · ${tx.note}`
  const foreign = acc && acc.currency !== displayCurrency()

  const inner = (
    <>
      <RowIcon emoji={icon} color={color} />
      <span className="lrow-main">
        <span className="t">{title}</span>
        <span className="s">{sub}</span>
      </span>
      <span className="lrow-right">
        <span className={`t money ${amountCls}`}>{amountText}</span>
        <span className="s">
          {foreign && <span className="money">≈ {fmtTHB(toTHB(tx.amount, acc))} · </span>}
          {fmtDate(tx.date)}
        </span>
      </span>
    </>
  )

  return onClick ? (
    <button className="lrow" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="lrow">{inner}</div>
  )
}
