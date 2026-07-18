import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icons'

export function Overlay({
  onClose,
  center,
  children,
}: {
  onClose: () => void
  center?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className={center ? 'overlay center' : 'overlay'}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <div className="spread">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </Overlay>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onClose,
  children,
}: {
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Overlay onClose={onClose} center>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {body && <p className="sub">{body}</p>}
        {children}
        <div className="grid2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function AmountInput({
  value,
  onChange,
  symbol,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  symbol: string
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div className="amount-wrap">
      <span className="cur">{symbol}</span>
      <input
        inputMode="decimal"
        placeholder={placeholder ?? '0'}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          if (/^[\d,]*\.?\d{0,2}$/.test(e.target.value)) onChange(e.target.value)
        }}
        aria-label="Amount"
      />
    </div>
  )
}

export const parseAmount = (s: string): number => {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, max, kind }: { value: number; max: number; kind?: 'sav' }) {
  const ratio = max > 0 ? value / max : 0
  const cls = kind ?? (ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : '')
  return (
    <div
      className={`progress ${cls}`}
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string
  title: string
  hint: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="big" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{hint}</p>
      {action}
    </div>
  )
}

export function RowIcon({ emoji, color }: { emoji: string; color?: string }) {
  return (
    <span
      className="lrow-icon"
      style={color ? { background: `color-mix(in srgb, ${color} 16%, var(--surface))` } : { background: 'var(--sunken)' }}
      aria-hidden
    >
      {emoji}
    </span>
  )
}

export function BackButton({ to, onClick }: { to?: string; onClick?: () => void }) {
  return (
    <button
      className="back"
      onClick={onClick ?? (() => (location.hash = to ?? '/more'))}
      aria-label="Back"
    >
      <Icon name="back" />
    </button>
  )
}
