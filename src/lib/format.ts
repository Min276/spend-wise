const SYMBOLS: Record<string, string> = {
  THB: '฿',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  SGD: 'S$',
  MMK: 'K ',
  AUD: 'A$',
}

export function symbolOf(currency: string): string {
  return SYMBOLS[currency] ?? currency + ' '
}

export function fmtMoney(n: number, currency = 'THB'): string {
  const sym = SYMBOLS[currency] ?? currency + ' '
  const sign = n < 0 ? '−' : ''
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${sign}${sym}${s}`
}

export const fmtTHB = (n: number) => fmtMoney(n, 'THB')

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
