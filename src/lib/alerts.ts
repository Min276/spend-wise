import type { AppData } from './types.ts'
import { monthOf, spentMonthByCategoryTHB, spentMonthTHB, spentTodayTHB, todayStr } from './money.ts'
import { fmtTHB } from './format.ts'

export interface AlertEvent {
  key: string
  kind: 'warn' | 'over'
  title: string
  body: string
  route: string
}

const WARN_AT = 0.8

export function evaluateAlerts(data: AppData): AlertEvent[] {
  const out: AlertEvent[] = []
  const today = todayStr()
  const month = monthOf(today)
  const { dailyLimit, monthlyBudget, perCategory } = data.budgets

  const push = (key: string, kind: AlertEvent['kind'], title: string, body: string) =>
    out.push({ key, kind, title, body, route: '/budgets' })

  if (dailyLimit && dailyLimit > 0) {
    const spent = spentTodayTHB(data)
    if (spent > dailyLimit)
      push(
        `d-over-${today}`,
        'over',
        'Daily limit exceeded',
        `${fmtTHB(spent)} spent today — ${fmtTHB(spent - dailyLimit)} over your ${fmtTHB(dailyLimit)} limit.`,
      )
    else if (spent >= WARN_AT * dailyLimit)
      push(
        `d-warn-${today}`,
        'warn',
        'Approaching daily limit',
        `${fmtTHB(spent)} of ${fmtTHB(dailyLimit)} spent today — ${fmtTHB(dailyLimit - spent)} left.`,
      )
  }

  if (monthlyBudget && monthlyBudget > 0) {
    const spent = spentMonthTHB(data, month)
    if (spent > monthlyBudget)
      push(
        `m-over-${month}`,
        'over',
        'Monthly budget exceeded',
        `${fmtTHB(spent)} spent this month — ${fmtTHB(spent - monthlyBudget)} over your ${fmtTHB(monthlyBudget)} budget.`,
      )
    else if (spent >= WARN_AT * monthlyBudget)
      push(
        `m-warn-${month}`,
        'warn',
        'Approaching monthly budget',
        `${fmtTHB(spent)} of ${fmtTHB(monthlyBudget)} spent — ${fmtTHB(monthlyBudget - spent)} left this month.`,
      )
  }

  const byCat = spentMonthByCategoryTHB(data, month)
  for (const [catId, limit] of Object.entries(perCategory)) {
    if (!limit || limit <= 0) continue
    const name = data.categories.find((c) => c.id === catId)?.name ?? 'Category'
    const spent = byCat.get(catId) ?? 0
    if (spent > limit)
      push(
        `mc-over-${catId}-${month}`,
        'over',
        `${name} budget exceeded`,
        `${fmtTHB(spent)} spent on ${name} this month — budget is ${fmtTHB(limit)}.`,
      )
    else if (spent >= WARN_AT * limit)
      push(
        `mc-warn-${catId}-${month}`,
        'warn',
        `${name} near its budget`,
        `${fmtTHB(spent)} of ${fmtTHB(limit)} spent on ${name} this month.`,
      )
  }

  return out
}

// Events not yet fired (per-day/per-month dedup lives in settings.firedKeys).
export function newAlerts(data: AppData): AlertEvent[] {
  return evaluateAlerts(data).filter((e) => !data.settings.firedKeys[e.key])
}
