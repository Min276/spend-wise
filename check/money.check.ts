import assert from 'node:assert/strict'
import type { AppData, Tx } from '../src/lib/types.ts'
import { migrateAccountsV2, seedData } from '../src/lib/seed.ts'
import {
  accountRaw,
  balanceSeriesTHB,
  expenseTHB,
  filterTxs,
  fundBalanceTHB,
  fundGrowthTHB,
  heldGrowthTHB,
  heldForPartyTHB,
  heldInAccount,
  heldTotalTHB,
  incomeTHB,
  netWorthTHB,
  periodKeys,
  savingsNetTHB,
  seriesByPeriod,
  shiftDate,
  spendable,
  spentTodayTHB,
  todayStr,
} from '../src/lib/money.ts'
import { evaluateAlerts, newAlerts } from '../src/lib/alerts.ts'
import { assist, type Block } from '../src/lib/assistant.ts'

const today = todayStr()
const yday = shiftDate(today, -1)

let n = 0
const tx = (t: Partial<Tx> & Pick<Tx, 'type' | 'amount' | 'accountId'>): Tx => ({
  id: `t${++n}`,
  date: today,
  createdAt: '2026-01-01T00:00:00Z',
  ...t,
})

const base = seedData()
const data: AppData = {
  ...base,
  accounts: [
    { id: 'k', name: 'KBank', type: 'Bank', currency: 'THB', fxRateToTHB: 1, icon: '🏦', color: '#10B981' },
    { id: 'w', name: 'Wise', type: 'Multi', currency: 'USD', fxRateToTHB: 36, icon: '🌐', color: '#0EA5E9' },
    { id: 't', name: 'TrueMoney', type: 'Wallet', currency: 'THB', fxRateToTHB: 1, icon: '📱', color: '#F97316' },
  ],
  heldParties: [
    { id: 'aunt', name: 'Aunt', isPrimary: true },
    { id: 'px', name: 'Ko Zaw' },
  ],
  transactions: [
    tx({ type: 'income', amount: 1000, accountId: 'k', sourceId: 'src-salary' }),
    tx({ type: 'income', amount: 100, accountId: 'w', sourceId: 'src-freelance' }),
    tx({ type: 'expense', amount: 200, accountId: 'k', categoryId: 'cat-food' }),
    tx({ type: 'transfer', amount: 50, accountId: 'w', toAccountId: 'k', toAmount: 1750 }),
    tx({ type: 'held_add', amount: 500, accountId: 'k', personId: 'aunt' }),
    tx({ type: 'held_add', amount: 300, accountId: 'k', personId: 'px' }),
    tx({ type: 'held_reduce', amount: 200, accountId: 'k', personId: 'aunt' }),
    tx({ type: 'fund_contribute', amount: 400, accountId: 'k', fundId: 'fund-education' }),
    tx({ type: 'fund_withdraw', amount: 100, accountId: 'k', fundId: 'fund-education' }),
    tx({ type: 'expense', amount: 30, accountId: 't', categoryId: 'cat-misc', date: yday }),
  ],
}
const txs = data.transactions

// raw balances fold every money movement; funds are earmarks (no-op)
assert.equal(accountRaw(txs, 'k'), 3150, 'KBank raw = 1000 - 200 + 1750 + 500 + 300 - 200')
assert.equal(accountRaw(txs, 'w'), 50, 'Wise raw in USD = 100 - 50')
assert.equal(accountRaw(txs, 't'), -30, 'TrueMoney raw')

// custodial: liability tracked, spendable = raw - held
assert.equal(heldInAccount(txs, 'k'), 600, 'held inside KBank = 500 + 300 - 200')
assert.equal(spendable(txs, 'k'), 2550, 'my real KBank money = 3150 - 600')
assert.equal(heldForPartyTHB(data, 'aunt'), 300, 'aunt = 500 - 200')
assert.equal(heldForPartyTHB(data, 'px'), 300)
assert.equal(heldTotalTHB(data), 600, 'total to return')

// net worth: personal money only, held excluded, fx converted
assert.equal(netWorthTHB(data), 2550 + 50 * 36 - 30, 'net worth = 4320')

// cross-currency transfer used toAmount (1750), not amount * fx (1800)
assert.equal(accountRaw(txs, 'k') - 1750, 1400, 'transfer credited toAmount')

// funds: earmarked, not double counted
assert.equal(fundBalanceTHB(data, 'fund-education'), 300, 'fund = 400 - 100')

// totals: transfers & held & funds never count as income/expense
assert.equal(incomeTHB(data, yday, today), 1000 + 3600, 'income converts USD at fx 36')
assert.equal(expenseTHB(data, today, today), 200)
assert.equal(expenseTHB(data, yday, today), 230)
assert.equal(savingsNetTHB(data, yday, today), 300)
assert.equal(spentTodayTHB(data), 200)

// account filter matches transfers on both sides
assert.equal(filterTxs(txs, { accountId: 'k', types: ['transfer'] }).length, 1)

// series: gap-filled, grouped, converted
const spendSeries = seriesByPeriod(data, filterTxs(txs, { types: ['expense'] }), 'day', yday, today)
assert.deepEqual(
  spendSeries.map((p) => p.value),
  [30, 200],
)
assert.deepEqual(periodKeys('2025-11', '2026-02', 'month'), ['2025-11', '2025-12', '2026-01', '2026-02'])

// balance trends: per-account raw; 'all' tracks net worth exactly
const kSeries = balanceSeriesTHB(data, 'k', 'day', yday, today)
assert.equal(kSeries[kSeries.length - 1]!.value, 3150)
const nwSeries = balanceSeriesTHB(data, 'all', 'day', yday, today)
assert.equal(nwSeries[nwSeries.length - 1]!.value, netWorthTHB(data))

// cumulative growth series agree with point-in-time balances
const eduGrowth = fundGrowthTHB(data, 'fund-education', 'day', yday, today)
assert.equal(eduGrowth[eduGrowth.length - 1]!.value, fundBalanceTHB(data, 'fund-education'))
const auntGrowth = heldGrowthTHB(data, 'aunt', 'day', yday, today)
assert.equal(auntGrowth[auntGrowth.length - 1]!.value, heldForPartyTHB(data, 'aunt'))

// budget alerts: 80% warn, then over; deduped via firedKeys
const warned: AppData = { ...data, budgets: { dailyLimit: 240, perCategory: { 'cat-food': 240 } } }
let events = evaluateAlerts(warned)
assert.ok(events.some((e) => e.key === `d-warn-${today}` && e.kind === 'warn'), '83% fires warn')
assert.ok(events.some((e) => e.key.startsWith('mc-warn-cat-food')), 'category warn')
assert.ok(!events.some((e) => e.kind === 'over'))

const over: AppData = {
  ...warned,
  budgets: { ...warned.budgets, monthlyBudget: 100 },
  transactions: [...txs, tx({ type: 'expense', amount: 50, accountId: 'k', categoryId: 'cat-food' })],
}
events = evaluateAlerts(over)
assert.ok(events.some((e) => e.key === `d-over-${today}`), '250 > 240 fires over')
assert.ok(!events.some((e) => e.key === `d-warn-${today}`), 'over suppresses warn')
assert.ok(events.some((e) => e.key.startsWith('m-over-')), 'monthly over')

const fired: AppData = {
  ...over,
  settings: { ...over.settings, firedKeys: { [`d-over-${today}`]: today } },
}
assert.ok(!newAlerts(fired).some((e) => e.key === `d-over-${today}`), 'no duplicate same-day alert')

// v2 account migration: renames old seed names, adds Cash, applies the order
const legacy = migrateAccountsV2([
  { id: 'acc-wise', name: 'Wise', type: 'Multi-currency', currency: 'THB', fxRateToTHB: 1, icon: '🌐', color: '#0EA5E9' },
  { id: 'acc-kbank', name: 'KPlus (KBank)', type: 'Bank', currency: 'THB', fxRateToTHB: 1, icon: '🏦', color: '#10B981' },
  { id: 'acc-tmn', name: 'TrueMoney Wallet', type: 'E-wallet', currency: 'THB', fxRateToTHB: 1, icon: '📱', color: '#F97316' },
])
assert.deepEqual(
  legacy.map((a) => a.name),
  ['TrueMoney', 'Cash', 'KBank', 'Wise'],
  'legacy seed migrates to renamed, ordered accounts with Cash inserted',
)

const custom = migrateAccountsV2([
  { id: 'acc-kbank', name: 'My K', type: 'Bank', currency: 'THB', fxRateToTHB: 1, icon: '🏦', color: '#10B981' },
  { id: 'x1', name: 'Krungsri', type: 'Bank', currency: 'THB', fxRateToTHB: 1, icon: '🏦', color: '#F43F5E' },
])
assert.deepEqual(
  custom.map((a) => a.name),
  ['Cash', 'My K', 'Krungsri'],
  'user renames survive; custom accounts keep relative order after seeded ones',
)
assert.equal(migrateAccountsV2(legacy).length, legacy.length, 'migration is idempotent — no duplicate Cash')

// assistant: command parsing produces the right proposed transactions
const seedFull: AppData = { ...seedData(), heldParties: data.heldParties }
const confirmOf = (blocks: Block[]) => {
  const c = blocks.find((b) => b.kind === 'confirm')
  assert.ok(c && c.kind === 'confirm', 'expected a confirm block, got: ' + JSON.stringify(blocks[0]))
  return c.tx
}

let ptx = confirmOf(assist(seedFull, 'add 500 food'))
assert.equal(ptx.type, 'expense')
assert.equal(ptx.amount, 500)
assert.equal(ptx.categoryId, 'cat-food', '"food" matches Daily Meals & Food')

ptx = confirmOf(assist(seedFull, 'add 30000 as salary to kbank'))
assert.equal(ptx.type, 'income')
assert.equal(ptx.sourceId, 'src-salary')
assert.equal(ptx.accountId, 'acc-kbank')

ptx = confirmOf(assist(seedFull, '5000 held for aunt in kbank'))
assert.equal(ptx.type, 'held_add')
assert.equal(ptx.personId, 'aunt')
assert.equal(ptx.accountId, 'acc-kbank')

ptx = confirmOf(assist(seedFull, 'returned 2000 to aunt'))
assert.equal(ptx.type, 'held_reduce')
assert.equal(ptx.personId, 'aunt')

ptx = confirmOf(assist(seedFull, 'save 500 to education'))
assert.equal(ptx.type, 'fund_contribute')
assert.equal(ptx.fundId, 'fund-education')

ptx = confirmOf(assist(seedFull, 'withdraw 200 from education fund'))
assert.equal(ptx.type, 'fund_withdraw')

ptx = confirmOf(assist(seedFull, 'transfer 1000 from wise to kbank'))
assert.equal(ptx.type, 'transfer')
assert.equal(ptx.accountId, 'acc-wise')
assert.equal(ptx.toAccountId, 'acc-kbank')

ptx = confirmOf(assist(seedFull, 'spent 1200 rent yesterday note july'))
assert.equal(ptx.categoryId, 'cat-rent')
assert.equal(ptx.date, yday)
assert.equal(ptx.note, 'july')

ptx = confirmOf(assist(seedFull, 'add 1.5k travel'))
assert.equal(ptx.amount, 1500, 'k suffix multiplies by 1000')

// assistant: queries answer without mutating
const q = assist(data, 'how much did i spend this month')
assert.ok(q.some((b) => b.kind === 'text' || b.kind === 'table'), 'spend query answers')
assert.ok(!q.some((b) => b.kind === 'confirm'), 'queries never propose transactions')
assert.ok(assist(data, 'report this month').some((b) => b.kind === 'stats'), 'report renders stats')
assert.ok(assist(data, 'balance').some((b) => b.kind === 'table'), 'balance lists accounts')
assert.ok(assist(data, 'who do i owe').some((b) => b.kind === 'table'), 'held query lists people')

console.log('✓ money.check: all assertions passed')
