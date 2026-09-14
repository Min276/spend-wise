import { useStore } from '../lib/store'
import { debtTotalTHB, fundBalanceTHB, heldTotalTHB, lentTotalTHB } from '../lib/money'
import { fmtTHB } from '../lib/format'
import { navigate } from '../lib/router'
import { Icon, type IconName } from '../components/Icons'

function MenuRow({
  icon,
  label,
  sub,
  value,
  valueCls,
  to,
}: {
  icon: IconName
  label: string
  sub: string
  value?: string
  valueCls?: string
  to: string
}) {
  return (
    <button className="lrow" onClick={() => navigate(to)}>
      <span className="lrow-icon" style={{ background: 'var(--sunken)', color: 'var(--primary)' }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="lrow-main">
        <span className="t">{label}</span>
        <span className="s">{sub}</span>
      </span>
      <span className="lrow-right">
        {value && <span className={`t money ${valueCls ?? ''}`}>{value}</span>}
      </span>
      <Icon name="chevron" size={18} />
    </button>
  )
}

export function More() {
  const { data } = useStore()
  const totalSaved = data.funds.reduce((s, f) => s + fundBalanceTHB(data, f.id), 0)
  const held = heldTotalTHB(data)
  const owe = debtTotalTHB(data)
  const lent = lentTotalTHB(data)
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>More</h1>
      </div>
      <div className="list">
        <MenuRow
          icon="target"
          label="Savings Funds"
          sub={`${data.funds.length} funds`}
          value={fmtTHB(totalSaved)}
          valueCls="amt-sav"
          to="/funds"
        />
        <MenuRow
          icon="users"
          label="Held for Others"
          sub="Money that isn't yours"
          value={held > 0 ? fmtTHB(held) : undefined}
          valueCls="amt-held"
          to="/held"
        />
        <MenuRow
          icon="swap"
          label="Debts & Loans"
          sub={owe > 0.005 ? 'You owe' : lent > 0.005 ? 'Owed to you' : 'Borrowed, lent, repaid'}
          value={owe > 0.005 ? fmtTHB(owe) : lent > 0.005 ? fmtTHB(lent) : undefined}
          valueCls={owe > 0.005 ? 'amt-debt' : 'amt-lent'}
          to="/debts"
        />
        <MenuRow icon="warn" label="Budgets & Limits" sub="Daily limit, monthly budgets" to="/budgets" />
        <MenuRow icon="sliders" label="Settings" sub="Accounts, categories, data, theme" to="/settings" />
      </div>
    </div>
  )
}
