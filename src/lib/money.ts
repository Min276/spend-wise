import type { Account, AppData, ID, Tx, TxType } from './types.ts'

/* ---------- dates ---------- */

const pad = (n: number) => String(n).padStart(2, '0')

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const todayStr = () => dateStr(new Date())
export const monthOf = (date: string) => date.slice(0, 7)
export const yearOf = (date: string) => date.slice(0, 4)

export type Gran = 'day' | 'month' | 'year'

export function keyOf(date: string, gran: Gran): string {
  return gran === 'day' ? date : gran === 'month' ? monthOf(date) : yearOf(date)
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y!, (m ?? 1) - 1, (d ?? 1) + days)
  return dateStr(dt)
}

export function periodKeys(from: string, to: string, gran: Gran): string[] {
  const keys: string[] = []
  if (from > to) return keys
  if (gran === 'day') {
    let d = from
    while (d <= to && keys.length < 1000) {
      keys.push(d)
      d = shiftDate(d, 1)
    }
  } else if (gran === 'month') {
    let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))]
    const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))]
    while ((y < ty || (y === ty && m <= tm)) && keys.length < 1000) {
      keys.push(`${y}-${pad(m)}`)
      m++
      if (m > 12) (m = 1), y++
    }
  } else {
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)) && keys.length < 1000; y++)
      keys.push(String(y))
  }
  return keys
}

/* ---------- lookups & currency ---------- */

export function byId<T extends { id: ID }>(xs: T[]): Map<ID, T> {
  return new Map(xs.map((x) => [x.id, x]))
}

export function toTHB(amount: number, account: Account | undefined): number {
  return amount * (account?.fxRateToTHB ?? 1)
}

/* ---------- account balances ---------- */

// Signed effect of a tx on an account's RAW balance, in that account's own
// currency. Fund moves are earmarks inside the account, so they are 0 here;
// held moves DO change the raw balance (the money physically arrives/leaves).
export function accountDelta(tx: Tx, accountId: ID): number {
  if (tx.type === 'transfer') {
    if (tx.accountId === accountId) return -tx.amount
    if (tx.toAccountId === accountId) return tx.toAmount ?? tx.amount
    return 0
  }
  if (tx.accountId !== accountId) return 0
  switch (tx.type) {
    case 'income':
    case 'held_add':
    case 'borrow':
    case 'collect':
      return tx.amount
    case 'expense':
    case 'held_reduce':
    case 'repay':
    case 'lend':
      return -tx.amount
    case 'fund_contribute':
    case 'fund_withdraw':
      return 0
  }
}

export function accountRaw(txs: Tx[], accountId: ID): number {
  let sum = 0
  for (const tx of txs) sum += accountDelta(tx, accountId)
  return sum
}

/* ---------- held (custodial) funds, debts & loans ---------- */

const heldSign = (t: TxType) => (t === 'held_add' ? 1 : t === 'held_reduce' ? -1 : 0)
// What I owe others (borrowed, not yet repaid) / what others owe me (lent, not yet back).
const debtSign = (t: TxType) => (t === 'borrow' ? 1 : t === 'repay' ? -1 : 0)
const lentSign = (t: TxType) => (t === 'lend' ? 1 : t === 'collect' ? -1 : 0)

// Σ sign(tx) × ฿ over the ledger, optionally for one party. Held, debt and lent
// balances are all this fold with a different sign table.
function signedTotalTHB(data: AppData, signOf: (t: TxType) => number, personId?: ID): number {
  const accounts = byId(data.accounts)
  let sum = 0
  for (const tx of data.transactions)
    if (!personId || tx.personId === personId) sum += signOf(tx.type) * toTHB(tx.amount, accounts.get(tx.accountId))
  return sum
}

export const heldForPartyTHB = (data: AppData, personId: ID) => signedTotalTHB(data, heldSign, personId)
export const heldTotalTHB = (data: AppData) => signedTotalTHB(data, heldSign)
export const debtForPartyTHB = (data: AppData, personId: ID) => signedTotalTHB(data, debtSign, personId)
export const debtTotalTHB = (data: AppData) => signedTotalTHB(data, debtSign)
export const lentForPartyTHB = (data: AppData, personId: ID) => signedTotalTHB(data, lentSign, personId)
export const lentTotalTHB = (data: AppData) => signedTotalTHB(data, lentSign)

// Liability sitting inside one account, in that account's currency.
export function heldInAccount(txs: Tx[], accountId: ID): number {
  let sum = 0
  for (const tx of txs) if (tx.accountId === accountId) sum += heldSign(tx.type) * tx.amount
  return sum
}

// One person's money sitting inside one account, in that account's currency.
export function heldPartyInAccount(txs: Tx[], personId: ID, accountId: ID): number {
  let sum = 0
  for (const tx of txs)
    if (tx.personId === personId && tx.accountId === accountId) sum += heldSign(tx.type) * tx.amount
  return sum
}

// My real spendable balance = raw − everything held for others in that account.
export function spendable(txs: Tx[], accountId: ID): number {
  return accountRaw(txs, accountId) - heldInAccount(txs, accountId)
}

// Personal money only: Σ spendable across accounts, converted to ฿, minus what I
// still owe on loans (borrowed cash sits in an account but isn't mine to keep).
// Money lent out is NOT added back — it's tracked as "owed to me" until it returns.
export function netWorthTHB(data: AppData): number {
  let sum = 0
  for (const acc of data.accounts) sum += toTHB(spendable(data.transactions, acc.id), acc)
  return sum - debtTotalTHB(data)
}

/* ---------- funds (earmarked savings) ---------- */

const fundSign = (t: TxType) => (t === 'fund_contribute' ? 1 : t === 'fund_withdraw' ? -1 : 0)

export function fundBalanceTHB(data: AppData, fundId: ID): number {
  const accounts = byId(data.accounts)
  let sum = 0
  for (const tx of data.transactions)
    if (tx.fundId === fundId) sum += fundSign(tx.type) * toTHB(tx.amount, accounts.get(tx.accountId))
  return sum
}

/* ---------- filtering & totals ---------- */

export interface TxFilter {
  types?: TxType[]
  accountId?: ID
  categoryId?: ID
  personId?: ID
  fundId?: ID
  sourceId?: ID
  from?: string
  to?: string
}

export function filterTxs(txs: Tx[], f: TxFilter): Tx[] {
  return txs.filter((tx) => {
    if (f.types && !f.types.includes(tx.type)) return false
    if (f.accountId && tx.accountId !== f.accountId && tx.toAccountId !== f.accountId) return false
    if (f.categoryId && tx.categoryId !== f.categoryId) return false
    if (f.personId && tx.personId !== f.personId) return false
    if (f.fundId && tx.fundId !== f.fundId) return false
    if (f.sourceId && tx.sourceId !== f.sourceId) return false
    if (f.from && tx.date < f.from) return false
    if (f.to && tx.date > f.to) return false
    return true
  })
}

export function sumTHB(data: AppData, txs: Tx[]): number {
  const accounts = byId(data.accounts)
  let sum = 0
  for (const tx of txs) sum += toTHB(tx.amount, accounts.get(tx.accountId))
  return sum
}

export function totalTHB(data: AppData, f: TxFilter): number {
  return sumTHB(data, filterTxs(data.transactions, f))
}

export const incomeTHB = (data: AppData, from: string, to: string) =>
  totalTHB(data, { types: ['income'], from, to })

export const expenseTHB = (data: AppData, from: string, to: string) =>
  totalTHB(data, { types: ['expense'], from, to })

// Net savings (contributions − withdrawals) over a period.
export const savingsNetTHB = (data: AppData, from: string, to: string) =>
  totalTHB(data, { types: ['fund_contribute'], from, to }) -
  totalTHB(data, { types: ['fund_withdraw'], from, to })

/* ---------- budgets ---------- */

export const spentTodayTHB = (data: AppData) => {
  const t = todayStr()
  return expenseTHB(data, t, t)
}

export function spentMonthTHB(data: AppData, month = monthOf(todayStr())): number {
  return expenseTHB(data, `${month}-01`, `${month}-31`)
}

export function spentMonthByCategoryTHB(data: AppData, month = monthOf(todayStr())): Map<ID, number> {
  const accounts = byId(data.accounts)
  const out = new Map<ID, number>()
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || monthOf(tx.date) !== month || !tx.categoryId) continue
    out.set(tx.categoryId, (out.get(tx.categoryId) ?? 0) + toTHB(tx.amount, accounts.get(tx.accountId)))
  }
  return out
}

/* ---------- chart series ---------- */

export interface SeriesPoint {
  key: string
  value: number
}

// Sum of the given txs (converted ฿) bucketed by period, gap-filled from..to.
export function seriesByPeriod(data: AppData, txs: Tx[], gran: Gran, from: string, to: string): SeriesPoint[] {
  const accounts = byId(data.accounts)
  const sums = new Map<string, number>()
  for (const tx of txs) {
    const k = keyOf(tx.date, gran)
    sums.set(k, (sums.get(k) ?? 0) + toTHB(tx.amount, accounts.get(tx.accountId)))
  }
  return periodKeys(keyOf(from, gran), keyOf(to, gran), gran).map((key) => ({
    key,
    value: sums.get(key) ?? 0,
  }))
}

export function spendByCategoryTHB(data: AppData, f: TxFilter): { categoryId: ID; value: number }[] {
  const accounts = byId(data.accounts)
  const sums = new Map<ID, number>()
  for (const tx of filterTxs(data.transactions, { ...f, types: ['expense'] })) {
    const id = tx.categoryId ?? 'uncategorized'
    sums.set(id, (sums.get(id) ?? 0) + toTHB(tx.amount, accounts.get(tx.accountId)))
  }
  return [...sums.entries()]
    .map(([categoryId, value]) => ({ categoryId, value }))
    .sort((a, b) => b.value - a.value)
}

// Running balance (converted ฿) per period. accountId 'all' = net worth trend.
export function balanceSeriesTHB(
  data: AppData,
  accountId: ID | 'all',
  gran: Gran,
  from: string,
  to: string,
): SeriesPoint[] {
  const accounts = byId(data.accounts)
  const deltaTHB = (tx: Tx): number => {
    if (accountId === 'all') {
      let d = 0
      if (tx.type === 'transfer') {
        d -= toTHB(tx.amount, accounts.get(tx.accountId))
        d += toTHB(tx.toAmount ?? tx.amount, accounts.get(tx.toAccountId ?? ''))
      } else {
        d += accountDelta(tx, tx.accountId) * (accounts.get(tx.accountId)?.fxRateToTHB ?? 1)
        // net worth excludes held money and outstanding debt
        d -= (heldSign(tx.type) + debtSign(tx.type)) * toTHB(tx.amount, accounts.get(tx.accountId))
      }
      return d
    }
    return toTHB(accountDelta(tx, accountId), accounts.get(accountId))
  }

  const fromKey = keyOf(from, gran)
  const toKey = keyOf(to, gran)
  let base = 0
  const perKey = new Map<string, number>()
  for (const tx of data.transactions) {
    const k = keyOf(tx.date, gran)
    if (k > toKey) continue
    const d = deltaTHB(tx)
    if (k < fromKey) base += d
    else perKey.set(k, (perKey.get(k) ?? 0) + d)
  }
  let running = base
  return periodKeys(fromKey, toKey, gran).map((key) => {
    running += perKey.get(key) ?? 0
    return { key, value: running }
  })
}

// Generic cumulative ฿ series: signOf gives each tx a signed multiplier.
function cumSeriesTHB(
  data: AppData,
  signOf: (tx: Tx) => number,
  gran: Gran,
  from: string,
  to: string,
): SeriesPoint[] {
  const accounts = byId(data.accounts)
  const fromKey = keyOf(from, gran)
  const toKey = keyOf(to, gran)
  let base = 0
  const perKey = new Map<string, number>()
  for (const tx of data.transactions) {
    const sign = signOf(tx)
    if (!sign) continue
    const k = keyOf(tx.date, gran)
    if (k > toKey) continue
    const d = sign * toTHB(tx.amount, accounts.get(tx.accountId))
    if (k < fromKey) base += d
    else perKey.set(k, (perKey.get(k) ?? 0) + d)
  }
  let running = base
  return periodKeys(fromKey, toKey, gran).map((key) => {
    running += perKey.get(key) ?? 0
    return { key, value: running }
  })
}

export const fundGrowthTHB = (data: AppData, fundId: ID | 'all', gran: Gran, from: string, to: string) =>
  cumSeriesTHB(data, (tx) => (fundId === 'all' || tx.fundId === fundId ? fundSign(tx.type) : 0), gran, from, to)

export const heldGrowthTHB = (data: AppData, personId: ID, gran: Gran, from: string, to: string) =>
  cumSeriesTHB(data, (tx) => (tx.personId === personId ? heldSign(tx.type) : 0), gran, from, to)

export function biggestExpenses(data: AppData, f: TxFilter, n: number): { tx: Tx; thb: number }[] {
  const accounts = byId(data.accounts)
  return filterTxs(data.transactions, { ...f, types: ['expense'] })
    .map((tx) => ({ tx, thb: toTHB(tx.amount, accounts.get(tx.accountId)) }))
    .sort((a, b) => b.thb - a.thb)
    .slice(0, n)
}
