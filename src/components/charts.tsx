import type { SeriesPoint } from '../lib/money'
import { fmtCompact } from '../lib/format'

const AXIS = { fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Inter, sans-serif' } as const

/* ---------- donut ---------- */

export function Donut({
  slices,
  size = 190,
  thickness = 28,
  centerLabel,
  centerValue,
}: {
  slices: { value: number; color: string }[]
  size?: number
  thickness?: number
  centerLabel: string
  centerValue: string
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const c = size / 2
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  let acc = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel} ${centerValue}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--sunken)" strokeWidth={thickness} />
      {total > 0 &&
        slices
          .filter((s) => s.value > 0)
          .map((s, i) => {
            const frac = s.value / total
            const dash = frac * C
            const off = acc * C
            acc += frac
            return (
              <circle
                key={i}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-off}
                transform={`rotate(-90 ${c} ${c})`}
              />
            )
          })}
      <text x={c} y={c - 4} textAnchor="middle" fill="var(--text)" fontSize={20} fontWeight={700} fontFamily="'Space Grotesk', sans-serif">
        {centerValue}
      </text>
      <text x={c} y={c + 14} textAnchor="middle" {...AXIS}>
        {centerLabel}
      </text>
    </svg>
  )
}

/* ---------- bars ---------- */

const W = 432

function xLabelIdx(n: number): number[] {
  if (n <= 8) return Array.from({ length: n }, (_, i) => i)
  return [0, Math.floor((n - 1) / 2), n - 1]
}

export function Bars({
  points,
  color,
  height = 150,
  fmtKey,
}: {
  points: SeriesPoint[]
  color: string
  height?: number
  fmtKey: (key: string) => string
}) {
  const n = points.length || 1
  const padB = 18
  const padT = 16
  const max = Math.max(...points.map((p) => p.value), 1)
  const step = W / n
  const bw = Math.min(30, step * 0.62)
  const labels = xLabelIdx(n)
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }} role="img">
      <line x1={0} x2={W} y1={height - padB} y2={height - padB} stroke="var(--border)" />
      {points.map((p, i) => {
        const h = (p.value / max) * (height - padT - padB)
        const x = i * step + (step - bw) / 2
        return (
          <g key={p.key}>
            {p.value > 0 && (
              <rect x={x} y={height - padB - h} width={bw} height={Math.max(h, 2)} rx={3} fill={color} />
            )}
            {n <= 8 && p.value > 0 && (
              <text x={x + bw / 2} y={height - padB - h - 5} textAnchor="middle" {...AXIS}>
                {fmtCompact(p.value)}
              </text>
            )}
            {labels.includes(i) && (
              <text x={x + bw / 2} y={height - 5} textAnchor="middle" {...AXIS}>
                {fmtKey(p.key)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ---------- paired bars (income vs spending) ---------- */

export function PairedBars({
  points,
  colorA,
  colorB,
  height = 150,
  fmtKey,
}: {
  points: { key: string; a: number; b: number }[]
  colorA: string
  colorB: string
  height?: number
  fmtKey: (key: string) => string
}) {
  const n = points.length || 1
  const padB = 18
  const padT = 10
  const max = Math.max(...points.flatMap((p) => [p.a, p.b]), 1)
  const step = W / n
  const bw = Math.min(16, step * 0.28)
  const labels = xLabelIdx(n)
  const bar = (v: number, x: number, color: string) => {
    const h = (v / max) * (height - padT - padB)
    return v > 0 ? <rect x={x} y={height - padB - h} width={bw} height={Math.max(h, 2)} rx={3} fill={color} /> : null
  }
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }} role="img">
      <line x1={0} x2={W} y1={height - padB} y2={height - padB} stroke="var(--border)" />
      {points.map((p, i) => {
        const cx = i * step + step / 2
        return (
          <g key={p.key}>
            {bar(p.a, cx - bw - 1.5, colorA)}
            {bar(p.b, cx + 1.5, colorB)}
            {labels.includes(i) && (
              <text x={cx} y={height - 5} textAnchor="middle" {...AXIS}>
                {fmtKey(p.key)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ---------- multi-series lines ---------- */

export function Lines({
  series,
  height = 170,
  fmtKey,
}: {
  series: { label: string; color: string; points: SeriesPoint[] }[]
  height?: number
  fmtKey: (key: string) => string
}) {
  const first = series[0]?.points ?? []
  const n = first.length || 1
  const padB = 18
  const padT = 8
  const padL = 34
  const innerW = W - padL
  const all = series.flatMap((s) => s.points.map((p) => p.value))
  const lo = Math.min(0, ...all)
  const hi = Math.max(...all, 1)
  const span = hi - lo || 1
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + (1 - (v - lo) / span) * (height - padT - padB)
  const labels = xLabelIdx(n)
  const gridVals = [lo, lo + span / 2, hi]
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }} role="img">
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={i === 0 && lo === 0 ? '' : '3 3'} />
          <text x={padL - 4} y={y(v) + 3} textAnchor="end" {...AXIS}>
            {fmtCompact(v)}
          </text>
        </g>
      ))}
      {lo < 0 && <line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke="var(--text-muted)" strokeDasharray="3 3" />}
      {series.map((s) => (
        <g key={s.label}>
          <polyline
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
          />
          {n <= 16 &&
            s.points.map((p, i) => <circle key={p.key} cx={x(i)} cy={y(p.value)} r={2.5} fill={s.color} />)}
        </g>
      ))}
      {first.map(
        (p, i) =>
          labels.includes(i) && (
            <text key={p.key} x={x(i)} y={height - 5} textAnchor="middle" {...AXIS}>
              {fmtKey(p.key)}
            </text>
          ),
      )}
    </svg>
  )
}

export function LegendChips({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="wrap">
      {items.map((it) => (
        <span key={it.label} className="chip" style={{ minHeight: 26, padding: '2px 10px' }}>
          <span className="dot" style={{ background: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  )
}
