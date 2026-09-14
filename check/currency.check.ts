import assert from 'node:assert/strict'
import {
  DEFAULT_RATES,
  applyRates,
  convert,
  displayOf,
  fmtMoney,
  fmtTHB,
  setDisplay,
  thbPerUnit,
} from '../src/lib/format.ts'
import { normalizeData, reducer } from '../src/lib/reducer.ts'
import { seedData } from '../src/lib/seed.ts'

// ฿ is the base; each app currency has one rate written the way people quote it.
assert.equal(thbPerUnit('THB'), 1)
assert.equal(thbPerUnit('USD'), 33, '1 USD = 33 ฿')
assert.ok(Math.abs(thbPerUnit('VND')! - 1 / 770) < 1e-12, '1 ฿ = 770 ₫')
assert.ok(Math.abs(thbPerUnit('MMK')! - 1 / 133) < 1e-12, '1 ฿ = 133 K')
assert.equal(thbPerUnit('EUR'), undefined, 'unknown currencies keep their per-account rate')

// cross rates derive through ฿, so they are always mutually consistent
assert.equal(convert(1, 'USD', 'THB', DEFAULT_RATES), 33)
assert.equal(Math.round(convert(1, 'USD', 'MMK', DEFAULT_RATES)), 4389, '33 × 133')
assert.equal(Math.round(convert(1, 'USD', 'VND', DEFAULT_RATES)), 25410, '33 × 770')
assert.equal(Math.round(convert(1000, 'MMK', 'VND', DEFAULT_RATES) * 100) / 100, 5789.47, '770 / 133 per kyat')
assert.equal(Math.round(convert(convert(500, 'THB', 'VND', DEFAULT_RATES), 'VND', 'THB', DEFAULT_RATES)), 500, 'round-trips')

// editable rates flow into the accounts' fxRateToTHB (the field money.ts reads)
const accounts = [
  { id: 'u', name: 'Wise USD', type: 'Multi', currency: 'USD', fxRateToTHB: 1, icon: '🌐', color: '#000' },
  { id: 'e', name: 'EUR', type: 'Bank', currency: 'EUR', fxRateToTHB: 38, icon: '🏦', color: '#000' },
  { id: 'b', name: 'KBank', type: 'Bank', currency: 'THB', fxRateToTHB: 1, icon: '🏦', color: '#000' },
]
const applied = applyRates(accounts, { ...DEFAULT_RATES, USD: 35 })
assert.equal(applied[0]!.fxRateToTHB, 35, 'USD account takes the shared rate')
assert.equal(applied[1]!.fxRateToTHB, 38, 'EUR account keeps its own rate')
assert.equal(applied[2], accounts[2], 'untouched accounts keep identity')

let state = normalizeData({ ...seedData(), accounts, settings: { ...seedData().settings, rates: { USD: 34, VND: 770, MMK: 133 } } })
assert.equal(state.accounts[0]!.fxRateToTHB, 34, 'normalizeData applies stored rates')
state = reducer(state, { type: 'settings/patch', patch: { rates: { USD: 36, VND: 800, MMK: 133 } } })
assert.equal(state.accounts[0]!.fxRateToTHB, 36, 'changing rates re-rates the accounts')
state = reducer(state, {
  type: 'entity/add',
  kind: 'accounts',
  item: { id: 'v', name: 'Dong', type: 'Cash', currency: 'VND', fxRateToTHB: 1, icon: '💵', color: '#000' },
})
assert.ok(Math.abs(state.accounts.find((a) => a.id === 'v')!.fxRateToTHB - 1 / 800) < 1e-12, 'new VND account gets the shared rate')

// display currency: fmtTHB always takes ฿ and renders the chosen currency
setDisplay({ currency: 'USD', rates: { USD: 33, VND: 770, MMK: 133 } })
assert.equal(fmtTHB(330), '$10')
setDisplay({ currency: 'VND' })
assert.equal(fmtTHB(1), '₫770')
setDisplay({ currency: 'MMK' })
assert.equal(fmtTHB(10), 'K 1,330', 'kyat shown without decimals')
setDisplay(undefined)
assert.equal(fmtTHB(1234.5), '฿1,234.5', 'default stays ฿')
assert.equal(fmtMoney(20397300.4, 'VND'), '₫20,397,300')

// inputs typed in the display currency store ฿, and an untouched value never drifts
const usd = displayOf({ currency: 'USD', rates: DEFAULT_RATES })
assert.equal(usd.str(800), '24.24')
assert.equal(usd.parse('24.24', 800), 800, 'unchanged text keeps the exact stored ฿')
assert.equal(usd.parse('30'), 990, 'new value converts at the rate')
assert.equal(usd.parse(''), undefined, 'empty clears the limit')
const thb = displayOf(undefined)
assert.equal(thb.parse('1,500'), 1500)

console.log('✓ currency.check: rates, cross conversions, account re-rating and display formatting pass')
