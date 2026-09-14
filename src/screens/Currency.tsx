import { useState } from 'react'
import { useStore } from '../lib/store'
import {
  APP_CURRENCIES,
  DEFAULT_RATES,
  RATE_STYLE,
  convert,
  fmtMoney,
  parseAmount,
  symbolOf,
  type Rates,
} from '../lib/format'
import { BackButton, Field, Seg } from '../components/ui'

const NAMES: Record<string, string> = { THB: 'Thai baht', USD: 'US dollar', VND: 'Vietnamese dong', MMK: 'Myanmar kyat' }

function RateRow({ cur, value, onChange }: { cur: keyof Rates; value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  const label = RATE_STYLE[cur] === 'unit' ? `1 ${cur} = ? THB` : `1 THB = ? ${cur}`
  return (
    <Field label={label}>
      <input
        className="input"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          if (!/^[\d,]*\.?\d*$/.test(e.target.value)) return
          setText(e.target.value)
          const n = parseAmount(e.target.value)
          if (n > 0) onChange(n)
        }}
        onBlur={() => setText(String(value))}
        aria-label={label}
      />
    </Field>
  )
}

export function Currency() {
  const { data, patchSettings } = useStore()
  const cur = data.settings.currency ?? 'THB'
  const rates: Rates = { ...DEFAULT_RATES, ...data.settings.rates }
  const setRate = (k: keyof Rates, n: number) => patchSettings({ rates: { ...rates, [k]: n } })

  // Every pair not entered directly, derived through ฿ so conversions can never disagree.
  const crosses: [number, string, string][] = [
    [1, 'USD', 'MMK'],
    [1, 'USD', 'VND'],
    [1000, 'MMK', 'VND'],
  ]

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/settings" />
          <h1>Currency & rates</h1>
        </span>
      </div>

      <div className="col-sm">
        <span className="label">Show amounts in</span>
        <div className="card col-sm">
          <Seg
            options={APP_CURRENCIES.map((c) => ({ value: c, label: `${symbolOf(c).trim()} ${c}` }))}
            value={cur}
            onChange={(currency) => patchSettings({ currency })}
          />
          <p className="sub">
            {NAMES[cur]}. Every total, chart and budget is shown in this currency. Entries stay recorded in their
            account's own currency and are converted at the rates below.
          </p>
        </div>
      </div>

      <div className="col-sm">
        <span className="label">Exchange rates (editable)</span>
        <div className="card col-sm">
          {(Object.keys(DEFAULT_RATES) as (keyof Rates)[]).map((k) => (
            <RateRow key={`${k}-${rates[k]}`} cur={k} value={rates[k]} onChange={(n) => setRate(k, n)} />
          ))}
          <p className="sub">
            Thai baht is the base: the three rates above define everything else, so cross rates are derived and
            always consistent —{' '}
            {crosses
              .map(([n, a, b]) => `${n.toLocaleString('en-US')} ${a} ≈ ${fmtMoney(convert(n, a, b, rates), b)}`)
              .join(' · ')}
            .
          </p>
          <button
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => patchSettings({ rates: { ...DEFAULT_RATES } })}
          >
            Reset to defaults (1 USD = 33 THB · 1 THB = 770 VND · 1 THB = 133 MMK)
          </button>
        </div>
      </div>

      <p className="muted">
        Accounts held in USD, VND or MMK use these shared rates automatically. Accounts in any other currency keep
        the rate set on the account itself.
      </p>
    </div>
  )
}
