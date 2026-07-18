import { useStore } from '../lib/store'
import { useAddSheet } from '../lib/sheet'
import { netWorthTHB, spendable, toTHB } from '../lib/money'
import { fmtMoney, fmtTHB } from '../lib/format'
import { navigate } from '../lib/router'
import { TxRow } from '../components/TxRow'
import { EmptyState } from '../components/ui'

export function Dashboard() {
  const { data } = useStore()
  const openSheet = useAddSheet()
  const recent = [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)

  return (
    <div className="screen">
      <div className="hero-card col-sm">
        <span className="hero-label">Net worth · my money only</span>
        <span className="hero-balance">{fmtTHB(netWorthTHB(data))}</span>
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
      </div>

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
  )
}
