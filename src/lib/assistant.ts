import type { Account, AppData, Tx } from './types.ts'
import {
  accountRaw,
  biggestExpenses,
  byId,
  expenseTHB,
  filterTxs,
  fundBalanceTHB,
  heldForPartyTHB,
  heldPartyInAccount,
  heldTotalTHB,
  incomeTHB,
  monthOf,
  netWorthTHB,
  savingsNetTHB,
  shiftDate,
  spendByCategoryTHB,
  spendable,
  spentMonthTHB,
  spentTodayTHB,
  sumTHB,
  todayStr,
  toTHB,
  yearOf,
} from './money.ts'
import { fmtDate, fmtMoney, fmtMonthKey, fmtTHB, symbolOf } from './format.ts'

/* ---------- reply blocks ---------- */

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'stats'; title?: string; items: { label: string; value: string; cls?: string }[] }
  | { kind: 'table'; title?: string; columns: string[]; rows: string[][]; footer?: string }
  | { kind: 'confirm'; text: string; tx: Omit<Tx, 'id' | 'createdAt'> }

const text = (t: string): Block => ({ kind: 'text', text: t })

/* ---------- text utils ---------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[?!.,;:()"'‘’“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

interface Period {
  from: string
  to: string
  label: string
}

function parsePeriod(t: string, today: string): Period | null {
  const y = Number(yearOf(today))
  const m = monthOf(today)
  if (/\btoday\b/.test(t)) return { from: today, to: today, label: 'today' }
  if (/\byesterday\b/.test(t)) {
    const d = shiftDate(today, -1)
    return { from: d, to: d, label: 'yesterday' }
  }
  if (/\bthis week\b/.test(t)) {
    const dow = new Date(today + 'T00:00').getDay()
    const mon = shiftDate(today, -((dow + 6) % 7))
    return { from: mon, to: today, label: 'this week' }
  }
  if (/\blast week\b/.test(t)) {
    const dow = new Date(today + 'T00:00').getDay()
    const mon = shiftDate(today, -((dow + 6) % 7))
    return { from: shiftDate(mon, -7), to: shiftDate(mon, -1), label: 'last week' }
  }
  if (/\bthis month\b/.test(t)) return { from: `${m}-01`, to: `${m}-31`, label: 'this month' }
  if (/\blast month\b/.test(t)) {
    const d = new Date(y, Number(m.slice(5)) - 2, 1)
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
    return { from: `${k}-01`, to: `${k}-31`, label: fmtMonthKey(k) }
  }
  if (/\bthis year\b/.test(t)) return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
  if (/\blast year\b/.test(t)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) }
  const mon = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b(?:\s+(20\d{2}))?/)
  if (mon) {
    const mi = MONTHS3.indexOf(mon[1]!) + 1
    const yr = mon[2] ? Number(mon[2]) : `${y}-${pad(mi)}` > m ? y - 1 : y
    const k = `${yr}-${pad(mi)}`
    return { from: `${k}-01`, to: `${k}-31`, label: fmtMonthKey(k) }
  }
  const yr = t.match(/\b(20\d{2})\b/)
  if (yr) return { from: `${yr[1]}-01-01`, to: `${yr[1]}-12-31`, label: yr[1]! }
  return null
}

// Pulls an explicit date out of an add-command; defaults to today.
function extractDate(t: string, today: string): { date: string; rest: string } {
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (iso) return { date: iso[1]!, rest: t.replace(iso[0], ' ') }
  if (/\byesterday\b/.test(t)) return { date: shiftDate(today, -1), rest: t.replace(/\byesterday\b/, ' ') }
  const dm = t.match(/\b(?:on\s+)?(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/)
  if (dm) {
    const mi = MONTHS3.indexOf(dm[2]!) + 1
    let date = `${yearOf(today)}-${pad(mi)}-${pad(Number(dm[1]))}`
    if (date > today) date = `${Number(yearOf(today)) - 1}-${pad(mi)}-${pad(Number(dm[1]))}`
    return { date, rest: t.replace(dm[0], ' ') }
  }
  return { date: today, rest: t.replace(/\btoday\b/, ' ') }
}

function extractNote(t: string): { note?: string; rest: string } {
  const q = t.match(/"([^"]+)"/)
  if (q) return { note: q[1], rest: t.replace(q[0], ' ') }
  const n = t.match(/\bnote\s+(.+)$/)
  if (n) return { note: n[1]!.trim(), rest: t.slice(0, n.index) }
  return { rest: t }
}

function extractAmount(t: string): { amount: number; rest: string } | null {
  const m = t.match(/(?:^|\s)฿?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/)
  if (!m) return null
  const amount = Number(m[1]!.replace(/,/g, '')) * (m[2] ? 1000 : 1)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { amount, rest: t.replace(m[0], ' ') }
}

/* ---------- fuzzy entity matching ---------- */

function matchIn<T extends { name: string }>(items: T[], t: string): { best: T | null; tie: boolean } {
  const padded = ' ' + t + ' '
  let bestScore = 0
  let best: T | null = null
  let tie = false
  for (const it of items) {
    const name = norm(it.name)
    let score = 0
    if (padded.includes(' ' + name + ' ')) score += 10
    const nameWords = name.split(' ').filter((w) => w.length > 1)
    for (const tok of t.split(' ')) {
      if (tok.length < 3) continue
      for (const w of nameWords) {
        if (tok === w) score += 3
        else if (w.startsWith(tok) || tok.startsWith(w)) score += 2
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = it
      tie = false
    } else if (score === bestScore && score > 0 && it !== best) tie = true
  }
  return bestScore >= 2 ? { best, tie } : { best: null, tie: false }
}

/* ---------- shared labels ---------- */

function txLabel(data: AppData, tx: Tx): string {
  switch (tx.type) {
    case 'expense':
      return data.categories.find((c) => c.id === tx.categoryId)?.name ?? 'Expense'
    case 'income':
      return data.incomeSources.find((s) => s.id === tx.sourceId)?.name ?? 'Income'
    case 'transfer': {
      const to = data.accounts.find((a) => a.id === tx.toAccountId)?.name ?? '?'
      return `→ ${to}`
    }
    case 'fund_contribute':
    case 'fund_withdraw': {
      const f = data.funds.find((x) => x.id === tx.fundId)?.name ?? 'Fund'
      return tx.type === 'fund_contribute' ? `Saved → ${f}` : `Withdrew ← ${f}`
    }
    case 'held_add':
    case 'held_reduce': {
      const p = data.heldParties.find((x) => x.id === tx.personId)?.name ?? '?'
      return tx.type === 'held_add' ? `Held for ${p}` : `Returned to ${p}`
    }
  }
}

const SIGN: Record<Tx['type'], string> = {
  income: '+',
  expense: '−',
  transfer: '',
  fund_contribute: '+',
  fund_withdraw: '−',
  held_add: '+',
  held_reduce: '−',
}

function txTable(data: AppData, txs: Tx[], title: string, cap = 12): Block {
  const accounts = byId(data.accounts)
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const rows = sorted.slice(0, cap).map((tx) => {
    const acc = accounts.get(tx.accountId)
    return [
      fmtDate(tx.date),
      txLabel(data, tx) + (tx.note ? ` · ${tx.note}` : ''),
      acc?.name ?? '?',
      SIGN[tx.type] + fmtMoney(tx.amount, acc?.currency),
    ]
  })
  return {
    kind: 'table',
    title,
    columns: ['Date', 'What', 'Account', 'Amount'],
    rows,
    footer: sorted.length > cap ? `Showing ${cap} of ${sorted.length} — see the Ledger tab for all.` : undefined,
  }
}

/* ---------- answers ---------- */

function balanceBlocks(data: AppData): Block[] {
  const legit = netWorthTHB(data)
  const held = heldTotalTHB(data)
  const inFunds = data.funds.reduce((s, f) => s + fundBalanceTHB(data, f.id), 0)
  return [
    {
      kind: 'stats',
      title: 'Your balances',
      items: [
        { label: 'My money (held excluded)', value: fmtTHB(legit), cls: 'amt-in' },
        { label: 'Total incl. held', value: fmtTHB(legit + held) },
        { label: 'Held for others', value: fmtTHB(held), cls: 'amt-held' },
        { label: 'In savings funds', value: fmtTHB(inFunds), cls: 'amt-sav' },
      ],
    },
    {
      kind: 'table',
      columns: ['Account', 'My money', 'Raw'],
      rows: data.accounts.map((a) => {
        const sp = spendable(data.transactions, a.id)
        const raw = accountRaw(data.transactions, a.id)
        const f = (n: number) => fmtMoney(n, a.currency) + (a.currency !== 'THB' ? ` (≈${fmtTHB(toTHB(n, a))})` : '')
        return [`${a.icon} ${a.name}`, f(sp), f(raw)]
      }),
      footer: held > 0.005 ? 'Raw includes money you are holding for others.' : undefined,
    },
  ]
}

function heldBlocks(data: AppData): Block[] {
  const rows = data.heldParties
    .map((p) => ({ p, v: heldForPartyTHB(data, p.id) }))
    .filter((x) => Math.abs(x.v) > 0.005)
  if (rows.length === 0) return [text('You are not holding money for anyone right now. 🎉')]
  const total = heldTotalTHB(data)
  return [
    {
      kind: 'table',
      title: 'Money you are holding',
      columns: ['Person', 'Amount'],
      rows: rows.map(({ p, v }) => [p.name + (p.isPrimary ? ' ⭐' : ''), fmtTHB(v)]),
      footer: `Total to return: ${fmtTHB(total)}. This never counts as your money.`,
    },
  ]
}

function budgetBlocks(data: AppData): Block[] {
  const { dailyLimit, monthlyBudget } = data.budgets
  if (!dailyLimit && !monthlyBudget)
    return [text('No limits set yet. Set a daily limit and monthly budget in More → Budgets & Limits.')]
  const items: { label: string; value: string; cls?: string }[] = []
  const spentD = spentTodayTHB(data)
  const spentM = spentMonthTHB(data)
  if (dailyLimit) {
    const left = dailyLimit - spentD
    items.push({ label: `Today · spent ${fmtTHB(spentD)} of ${fmtTHB(dailyLimit)}`, value: left >= 0 ? `${fmtTHB(left)} left` : `${fmtTHB(-left)} over`, cls: left >= 0 ? 'amt-in' : 'amt-out' })
  }
  if (monthlyBudget) {
    const left = monthlyBudget - spentM
    items.push({ label: `This month · spent ${fmtTHB(spentM)} of ${fmtTHB(monthlyBudget)}`, value: left >= 0 ? `${fmtTHB(left)} left` : `${fmtTHB(-left)} over`, cls: left >= 0 ? 'amt-in' : 'amt-out' })
  }
  return [{ kind: 'stats', title: 'Budget status', items }]
}

function spendBlocks(data: AppData, t: string, today: string): Block[] {
  const period = parsePeriod(t, today) ?? { from: `${monthOf(today)}-01`, to: `${monthOf(today)}-31`, label: 'this month' }
  const cat = matchIn(data.categories, t).best
  if (cat) {
    const txs = filterTxs(data.transactions, { types: ['expense'], categoryId: cat.id, from: period.from, to: period.to })
    const total = sumTHB(data, txs)
    return [
      text(`${cat.icon} ${cat.name} ${period.label}: ${fmtTHB(total)} across ${txs.length} ${txs.length === 1 ? 'entry' : 'entries'}.`),
      ...(txs.length ? [txTable(data, txs, '')] : []),
    ]
  }
  const total = expenseTHB(data, period.from, period.to)
  const byCat = spendByCategoryTHB(data, { from: period.from, to: period.to }).slice(0, 6)
  const blocks: Block[] = [text(`You spent ${fmtTHB(total)} ${period.label}.`)]
  if (byCat.length)
    blocks.push({
      kind: 'table',
      columns: ['Category', 'Amount', '%'],
      rows: byCat.map((c) => {
        const cc = data.categories.find((x) => x.id === c.categoryId)
        return [`${cc?.icon ?? '❔'} ${cc?.name ?? 'Uncategorized'}`, fmtTHB(c.value), `${Math.round((c.value / total) * 100)}%`]
      }),
    })
  return blocks
}

function reportBlocks(data: AppData, t: string, today: string): Block[] {
  const period = parsePeriod(t, today) ?? { from: `${monthOf(today)}-01`, to: `${monthOf(today)}-31`, label: 'this month' }
  const income = incomeTHB(data, period.from, period.to)
  const spend = expenseTHB(data, period.from, period.to)
  const saved = savingsNetTHB(data, period.from, period.to)
  const byCat = spendByCategoryTHB(data, { from: period.from, to: period.to }).slice(0, 5)
  const biggest = biggestExpenses(data, { from: period.from, to: period.to }, 3)
  return [
    {
      kind: 'stats',
      title: `Report · ${period.label}`,
      items: [
        { label: 'Income', value: '+' + fmtTHB(income), cls: 'amt-in' },
        { label: 'Spending', value: '−' + fmtTHB(spend), cls: 'amt-out' },
        { label: 'Net', value: fmtTHB(income - spend), cls: income - spend >= 0 ? 'amt-in' : 'amt-out' },
        { label: 'Saved to funds', value: fmtTHB(saved), cls: 'amt-sav' },
      ],
    },
    ...(byCat.length
      ? [
          {
            kind: 'table' as const,
            title: 'Top categories',
            columns: ['Category', 'Amount', '%'],
            rows: byCat.map((c) => {
              const cc = data.categories.find((x) => x.id === c.categoryId)
              return [`${cc?.icon ?? '❔'} ${cc?.name ?? 'Uncategorized'}`, fmtTHB(c.value), spend ? `${Math.round((c.value / spend) * 100)}%` : '—']
            }),
          },
        ]
      : []),
    ...(biggest.length ? [txTable(data, biggest.map((b) => b.tx), 'Biggest expenses', 3)] : []),
    text('Full charts are in the Reports tab. 📊'),
  ]
}

const HELP = `Here's what I understand:

💸 Add money records
• add 500 food
• spent 1200 rent yesterday from kbank
• add 30000 as salary to kbank
• 5000 held for Aunt in kbank
• returned 2000 to aunt
• save 500 to education · withdraw 200 from visa fund
• transfer 1000 wise to kbank
• add "note in quotes" or: note lunch with friends

📊 Ask me things
• balance · net worth
• spending this month · food spending in june
• income this year · savings
• how much for aunt? · who do I owe?
• budget left
• show travel records · last records · biggest expenses
• report this month · report june

I always ask you to confirm before saving anything.`

/* ---------- mutation parsing ---------- */

function pickAccount(data: AppData, t: string): Account | null {
  return matchIn(data.accounts, t).best
}

function defaultAccount(data: AppData): Account {
  return (
    data.accounts.find((a) => a.id === data.settings.lastUsedAccountId) ?? data.accounts[0]!
  )
}

function confirmBlock(data: AppData, tx: Omit<Tx, 'id' | 'createdAt'>, extra = ''): Block {
  const acc = data.accounts.find((a) => a.id === tx.accountId)
  const sym = symbolOf(acc?.currency ?? 'THB')
  const what = txLabel(data, tx as Tx)
  const kindWord: Record<Tx['type'], string> = {
    expense: 'expense',
    income: 'income',
    transfer: 'transfer',
    fund_contribute: 'saving',
    fund_withdraw: 'fund withdrawal',
    held_add: 'held money',
    held_reduce: 'held return',
  }
  const dateWord = tx.date === todayStr() ? 'today' : fmtDate(tx.date)
  return {
    kind: 'confirm',
    text: `Add ${kindWord[tx.type]}: ${sym}${tx.amount.toLocaleString('en-US')} · ${what} · ${acc?.name ?? '?'} · ${dateWord}${tx.note ? ` · “${tx.note}”` : ''}${extra}`,
    tx,
  }
}

function parseMutation(data: AppData, raw: string, today: string): Block[] | null {
  const noteRes = extractNote(raw)
  const dateRes = extractDate(noteRes.rest, today)
  const amountRes = extractAmount(dateRes.rest)

  const t = norm(amountRes ? amountRes.rest : dateRes.rest)
  const hasAddVerb = /\b(add|spent|spend|paid|pay|bought|buy|got|received|earned|save|saved|withdraw|transfer|move|sent|returned|return|held|holding|keep)\b/.test(t)
  if (!amountRes) {
    if (hasAddVerb && extractAmount(raw) === null && !/\b(show|list|how|what|report|records|history)\b/.test(t))
      return [text('How much? Try: add 500 food')]
    return null
  }
  const { amount } = amountRes
  const base = { amount, date: dateRes.date, note: noteRes.note }

  // transfer: needs two accounts around "to"
  if (/\b(transfer|move)\b/.test(t) || /\bto\b/.test(t)) {
    const m = t.match(/(?:transfer|move|send)?\s*(?:from\s+)?(.*?)\s+(?:to|into)\s+(.+)/)
    if (m && /\b(transfer|move)\b/.test(t)) {
      const from = pickAccount(data, m[1] ?? '')
      const to = pickAccount(data, m[2] ?? '')
      if (from && to && from.id !== to.id) {
        const cross = from.currency !== to.currency
        return [
          confirmBlock(
            data,
            {
              type: 'transfer',
              ...base,
              accountId: from.id,
              toAccountId: to.id,
              toAmount: cross ? (amount * from.fxRateToTHB) / (to.fxRateToTHB || 1) : undefined,
            },
            cross ? ' · converted at your FX rates' : '',
          ),
        ]
      }
      return [text(`Which accounts? Try: transfer 1000 ${data.accounts[0]?.name ?? 'wise'} to ${data.accounts[1]?.name ?? 'kbank'}`)]
    }
  }

  // held money
  const person = matchIn(data.heldParties, t).best
  const heldWords = /\b(held|holding|hold|keeps?|park(ed)?)\b/.test(t)
  const returnWords = /\b(return(ed)?|(sent|send|gave|give|paid|pay)\s*back|repaid)\b/.test(t)
  if (person || heldWords) {
    const p = person ?? data.heldParties.find((x) => x.isPrimary) ?? data.heldParties[0]
    if (!p) return [text('Add a person first (Held for Others → + Person), then tell me again.')]
    const type = returnWords ? 'held_reduce' : 'held_add'
    if (person || heldWords) {
      // held money usually lands where it already sits; fall back to last used
      const acc =
        pickAccount(data, t) ??
        [...data.accounts].sort(
          (a, b) => heldPartyInAccount(data.transactions, p.id, b.id) - heldPartyInAccount(data.transactions, p.id, a.id),
        )[0] ??
        defaultAccount(data)
      if (type === 'held_reduce' || heldWords || /\b(sent|sends|for)\b/.test(t))
        return [
          confirmBlock(data, { type, ...base, accountId: acc.id, personId: p.id }, person ? '' : ` · assumed ${p.name}`),
        ]
    }
  }

  // savings funds
  const fund = matchIn(data.funds, t).best
  if (fund && /\b(save|saved|saving|fund|withdraw|withdrew|took?)\b/.test(t)) {
    const type = /\b(withdraw|withdrew|took?)\b/.test(t) ? 'fund_withdraw' : 'fund_contribute'
    const acc = pickAccount(data, t) ?? data.accounts.find((a) => a.id === fund.accountId) ?? defaultAccount(data)
    return [confirmBlock(data, { type, ...base, accountId: acc.id, fundId: fund.id })]
  }

  // income
  const source = matchIn(data.incomeSources, t).best
  if (source && (/\b(as|from|income|received|got|earned)\b/.test(t) || norm(source.name).split(' ').some((w) => t.includes(w)))) {
    const acc = pickAccount(data, t) ?? defaultAccount(data)
    return [confirmBlock(data, { type: 'income', ...base, accountId: acc.id, sourceId: source.id })]
  }

  // expense (default)
  const cat = matchIn(data.categories, t).best
  const acc = pickAccount(data, t) ?? defaultAccount(data)
  const misc = data.categories.find((c) => c.id === 'cat-misc') ?? data.categories[data.categories.length - 1]
  if (!cat && !misc) return [text('Add a category first, then tell me again.')]
  return [
    confirmBlock(
      data,
      { type: 'expense', ...base, accountId: acc.id, categoryId: (cat ?? misc)!.id },
      cat ? '' : ` · no category matched, using ${misc!.name}`,
    ),
  ]
}

/* ---------- main entry ---------- */

export function assist(data: AppData, input: string): Block[] {
  const today = todayStr()
  const raw = norm(input)
  if (!raw) return [text('Type a command or question — or say "help".')]

  if (/^(help|commands?|what can you do|how do i .*)$/.test(raw) || raw === '?') return [text(HELP)]

  // queries first when clearly interrogative / no amount
  const isQuery = /\b(how much|how many|show|list|what|who|balance|net worth|report|records|history|biggest|largest|top|left|remaining|status)\b/.test(raw)

  if (!isQuery) {
    const mutation = parseMutation(data, input, today)
    if (mutation) return mutation
  }

  if (/\b(balance|net worth|have|worth)\b/.test(raw) && !/\bfund|held|hold|owe\b/.test(raw)) return balanceBlocks(data)
  if (/\b(hold|held|holding|owe|owed)\b/.test(raw)) {
    const p = matchIn(data.heldParties, raw).best
    if (p) {
      const total = heldForPartyTHB(data, p.id)
      const txs = filterTxs(data.transactions, { personId: p.id })
      return [
        text(`You are holding ${fmtTHB(total)} for ${p.name}.`),
        ...(txs.length ? [txTable(data, txs, `${p.name} — history`, 8)] : []),
      ]
    }
    return heldBlocks(data)
  }
  if (/\b(budget|limit|left|remaining|can i spend)\b/.test(raw)) return budgetBlocks(data)
  if (/\breport\b/.test(raw)) return reportBlocks(data, raw, today)
  if (/\b(biggest|largest|top)\b/.test(raw) && /\b(expense|spend)/.test(raw)) {
    const period = parsePeriod(raw, today) ?? { from: `${monthOf(today)}-01`, to: `${monthOf(today)}-31`, label: 'this month' }
    const big = biggestExpenses(data, { from: period.from, to: period.to }, 5)
    return big.length
      ? [txTable(data, big.map((b) => b.tx), `Biggest expenses ${period.label}`, 5)]
      : [text(`No expenses ${period.label}.`)]
  }
  if (/\b(income|earned|salary)\b/.test(raw) && /\b(how much|this|last|show|total|in |report)\b/.test(raw)) {
    const period = parsePeriod(raw, today) ?? { from: `${monthOf(today)}-01`, to: `${monthOf(today)}-31`, label: 'this month' }
    const total = incomeTHB(data, period.from, period.to)
    const txs = filterTxs(data.transactions, { types: ['income'], from: period.from, to: period.to })
    return [text(`Income ${period.label}: ${fmtTHB(total)}.`), ...(txs.length ? [txTable(data, txs, '', 8)] : [])]
  }
  if (/\b(saving|savings|saved|funds?)\b/.test(raw)) {
    const fund = matchIn(data.funds, raw).best
    if (fund)
      return [
        text(`${fund.icon} ${fund.name}: ${fmtTHB(fundBalanceTHB(data, fund.id))} saved${fund.target ? ` of ${fmtTHB(fund.target)} target` : ''}.`),
      ]
    const rows = data.funds.map((f) => [
      `${f.icon} ${f.name}`,
      fmtTHB(fundBalanceTHB(data, f.id)),
      f.target ? fmtTHB(f.target) : '—',
    ])
    return rows.length
      ? [{ kind: 'table', title: 'Savings funds', columns: ['Fund', 'Saved', 'Target'], rows }]
      : [text('No savings funds yet — create one in More → Savings Funds.')]
  }
  if (/\b(spent|spending|spend|expenses?)\b/.test(raw)) return spendBlocks(data, raw, today)
  if (/\b(show|list|records|history|transactions?|last)\b/.test(raw)) {
    const period = parsePeriod(raw, today)
    const cat = matchIn(data.categories, raw).best
    const p = matchIn(data.heldParties, raw).best
    const acc = pickAccount(data, raw)
    const txs = filterTxs(data.transactions, {
      from: period?.from,
      to: period?.to,
      categoryId: cat?.id,
      personId: p?.id,
      accountId: acc?.id,
    })
    const bits = [cat?.name, p?.name, acc?.name, period?.label].filter(Boolean).join(' · ')
    return txs.length
      ? [txTable(data, txs, `Records${bits ? ` — ${bits}` : ''}`)]
      : [text(`No records found${bits ? ` for ${bits}` : ''}.`)]
  }

  // last resort: maybe it was a terse add command after all
  const mutation = parseMutation(data, input, today)
  if (mutation) return mutation

  return [text(`I didn't catch that. Try "add 500 food", "spending this month", or say "help" for everything I understand.`)]
}

/* ---------- post-save summary (used by the chat after a confirmed add) ---------- */

export function afterSaveLine(data: AppData, tx: Omit<Tx, 'id' | 'createdAt'>): string {
  const acc = data.accounts.find((a) => a.id === tx.accountId)
  const thb = toTHB(tx.amount, acc)
  if (tx.type === 'expense') {
    const spent = spentTodayTHB(data) + (tx.date === todayStr() ? thb : 0)
    const { dailyLimit } = data.budgets
    if (dailyLimit && tx.date === todayStr())
      return spent <= dailyLimit
        ? `Saved ✓ Today: ${fmtTHB(spent)} of ${fmtTHB(dailyLimit)} — ${fmtTHB(dailyLimit - spent)} left.`
        : `Saved ✓ Today: ${fmtTHB(spent)} — ${fmtTHB(spent - dailyLimit)} over your ${fmtTHB(dailyLimit)} limit.`
    return `Saved ✓ Spending today: ${fmtTHB(spent)}.`
  }
  if (tx.type === 'held_add' || tx.type === 'held_reduce') {
    const p = data.heldParties.find((x) => x.id === tx.personId)
    const now = heldForPartyTHB(data, tx.personId!) + (tx.type === 'held_add' ? thb : -thb)
    return `Saved ✓ Now holding ${fmtTHB(now)} for ${p?.name ?? 'them'}.`
  }
  if (tx.type === 'fund_contribute' || tx.type === 'fund_withdraw') {
    const f = data.funds.find((x) => x.id === tx.fundId)
    const now = fundBalanceTHB(data, tx.fundId!) + (tx.type === 'fund_contribute' ? thb : -thb)
    return `Saved ✓ ${f?.name ?? 'Fund'}: ${fmtTHB(now)}${f?.target ? ` of ${fmtTHB(f.target)}` : ''}.`
  }
  if (tx.type === 'income') return `Saved ✓ ${fmtTHB(thb)} in. Net worth: ${fmtTHB(netWorthTHB(data) + thb)}.`
  return 'Saved ✓'
}
