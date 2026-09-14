import type { Account } from './types.ts'

const SYMBOLS: Record<string, string> = {
  THB: '฿',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  SGD: 'S$',
  MMK: 'K ',
  VND: '₫',
  AUD: 'A$',
}

// Currencies with a 0-decimal convention.
const WHOLE = new Set(['VND', 'MMK', 'JPY'])

export function symbolOf(currency: string): string {
  return SYMBOLS[currency] ?? currency + ' '
}

export function fmtMoney(n: number, currency = 'THB'): string {
  const sym = SYMBOLS[currency] ?? currency + ' '
  const sign = n < 0 ? '−' : ''
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: WHOLE.has(currency) ? 0 : 2,
  })
  return `${sign}${sym}${s}`
}

export const parseAmount = (s: string): number => {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/* ---------- app currencies & rates ---------- */

// ฿ is the base every total is computed in. The other app currencies convert
// through it with one editable rate each, written the way people quote them.
export const APP_CURRENCIES = ['THB', 'USD', 'VND', 'MMK'] as const
export type AppCurrency = (typeof APP_CURRENCIES)[number]
export type Rates = Record<'USD' | 'VND' | 'MMK', number>

export const DEFAULT_RATES: Rates = { USD: 33, VND: 770, MMK: 133 }
// 'unit' = ฿ per 1 unit (1 USD = 33 ฿); 'perTHB' = units per 1 ฿ (1 ฿ = 770 ₫).
export const RATE_STYLE: Record<keyof Rates, 'unit' | 'perTHB'> = { USD: 'unit', VND: 'perTHB', MMK: 'perTHB' }

export const isAppCurrency = (c: string): c is AppCurrency => (APP_CURRENCIES as readonly string[]).includes(c)

// ฿ per one unit of `cur`; undefined for currencies the shared table doesn't know.
export function thbPerUnit(cur: string, rates: Rates = DEFAULT_RATES): number | undefined {
  if (cur === 'THB') return 1
  if (!isAppCurrency(cur) || cur === 'THB') return undefined
  const r = rates[cur] || DEFAULT_RATES[cur]
  return RATE_STYLE[cur] === 'unit' ? r : 1 / r
}

export const convert = (amount: number, from: string, to: string, rates: Rates): number =>
  (amount * (thbPerUnit(from, rates) ?? 1)) / (thbPerUnit(to, rates) ?? 1)

// Accounts in an app currency always carry the shared rate, so per-account
// fxRateToTHB stays the single field money.ts reads. Other currencies keep
// whatever the user typed on the account.
export function applyRates(accounts: Account[], rates: Rates): Account[] {
  return accounts.map((a) => {
    const r = thbPerUnit(a.currency, rates)
    return r === undefined || r === a.fxRateToTHB ? a : { ...a, fxRateToTHB: r }
  })
}

/* ---------- display currency ---------- */

interface DisplaySettings {
  currency?: string
  rates?: Partial<Rates>
}

// ponytail: module-level display config instead of threading settings through
// every fmtTHB call site (~100). StoreProvider sets it before children render;
// the service worker sets it from its data snapshot. Default = ฿, so the pure
// self-checks and the assistant corpus see unchanged output.
let display: { cur: AppCurrency; rates: Rates } = { cur: 'THB', rates: DEFAULT_RATES }

export function setDisplay(s: DisplaySettings | undefined) {
  display = {
    cur: s?.currency && isAppCurrency(s.currency) ? s.currency : 'THB',
    rates: { ...DEFAULT_RATES, ...s?.rates },
  }
}

export const displayCurrency = (): AppCurrency => display.cur
export const displayRates = (): Rates => display.rates

// Formats a ฿-denominated amount in the user's display currency.
export const fmtTHB = (n: number) => fmtMoney(n / thbPerUnit(display.cur, display.rates)!, display.cur)

// Helpers for inputs that store ฿ but are typed in the display currency.
export function displayOf(s: DisplaySettings | undefined) {
  const cur = s?.currency && isAppCurrency(s.currency) ? s.currency : 'THB'
  const rates = { ...DEFAULT_RATES, ...s?.rates }
  const per = thbPerUnit(cur, rates)!
  const str = (thb: number) => String(Math.round((thb / per) * 100) / 100)
  return {
    cur,
    sym: symbolOf(cur),
    str,
    // Unchanged text keeps the stored ฿ value exactly, so re-saving never drifts by rounding.
    parse: (text: string, prevTHB?: number): number | undefined => {
      if (prevTHB && text === str(prevTHB)) return prevTHB
      const n = parseAmount(text)
      return n > 0 ? n * per : undefined
    },
  }
}

export function fmtSigned(n: number, currency = 'THB'): string {
  return (n > 0 ? '+' : '') + fmtMoney(n, currency)
}

export function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e6) return `${(n / 1e6).toFixed(a < 1e7 ? 1 : 0)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(a < 1e4 ? 1 : 0)}k`
  return String(Math.round(n))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const thisYear = new Date().getFullYear()
  const base = `${d} ${MONTHS[(m ?? 1) - 1]}`
  return y === thisYear ? base : `${base} ${y}`
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${fmtDate(iso.slice(0, 10))}, ${hh}:${mm}`
}

export function fmtMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1]} ${y}`
}

export function fmtPeriodKey(key: string, gran: 'day' | 'month' | 'year'): string {
  if (gran === 'day') return fmtDate(key)
  if (gran === 'month') return fmtMonthKey(key)
  return key
}
