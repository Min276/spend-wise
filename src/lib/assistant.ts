import type { Account, AppData, ID, Tx, TxType } from './types.ts'
import {
  accountRaw,
  biggestExpenses,
  byId,
  debtForPartyTHB,
  debtTotalTHB,
  expenseTHB,
  filterTxs,
  fundBalanceTHB,
  heldForPartyTHB,
  heldPartyInAccount,
  heldTotalTHB,
  incomeTHB,
  lentForPartyTHB,
  lentTotalTHB,
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
import {
  DEFAULT_RATES,
  displayCurrency,
  fmtDate,
  fmtMoney,
  fmtMonthKey,
  fmtTHB,
  symbolOf,
  thbPerUnit,
  type Rates,
} from './format.ts'

/* ---------- reply blocks ---------- */

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'stats'; title?: string; items: { label: string; value: string; cls?: string }[] }
  | { kind: 'table'; title?: string; columns: string[]; rows: string[][]; footer?: string }
  | { kind: 'confirm'; text: string; tx: Omit<Tx, 'id' | 'createdAt'>; newParty?: string }
  | { kind: 'delete'; text: string; txId: ID }

const text = (t: string): Block => ({ kind: 'text', text: t })

/* ---------- text utils ---------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[?!.,;:()"'‘’“”/\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Cheap suffix stemmer so "donated"/"donations"/"treats" reach "donation"/"treat".
const stem = (w: string) =>
  w.length > 5 && w.endsWith('ing')
    ? w.slice(0, -3)
    : w.length > 4 && w.endsWith('ed')
      ? w.slice(0, -2)
      : w.length > 3 && w.endsWith('s') && !w.endsWith('ss')
        ? w.slice(0, -1)
        : w

const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')
const round2 = (n: number) => Math.round(n * 100) / 100

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

// Currency words/symbols that may sit before or after an amount.
const CUR_TOKENS: [RegExp, string][] = [
  [/^(\$|usd|dollars?|bucks?)$/i, 'USD'],
  [/^(฿|thb|baht)$/i, 'THB'],
  [/^(₫|vnd|dong)$/i, 'VND'],
  [/^(mmk|kyats?)$/i, 'MMK'],
]
const curOf = (tok: string | undefined) => (tok ? CUR_TOKENS.find(([re]) => re.test(tok))?.[1] : undefined)

// "500", "1.5k", "$20", "20 usd", "500k mmk", "฿250" → amount (+ currency when stated).
function extractAmount(t: string): { amount: number; cur?: string; rest: string } | null {
  const m = t.match(
    /(?:^|\s)([$฿₫]|usd|thb|mmk|vnd)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?(?:\s*([$฿₫]|usd|thb|mmk|vnd|baht|dollars?|bucks?|kyats?|dong)\b)?/i,
  )
  if (!m) return null
  const amount = Number(m[2]!.replace(/,/g, '')) * (m[3] ? 1000 : 1)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { amount, cur: curOf(m[1]) ?? curOf(m[4]), rest: t.replace(m[0], ' ') }
}

/* ---------- fuzzy entity matching ---------- */

function matchIn<T extends { name: string }>(items: T[], t: string): { best: T | null; tie: boolean } {
  const padded = ' ' + t + ' '
  const toks = t.split(' ').map(stem)
  let bestScore = 0
  let best: T | null = null
  let tie = false
  for (const it of items) {
    const name = norm(it.name)
    let score = 0
    if (padded.includes(' ' + name + ' ')) score += 10
    const nameWords = name.split(' ').filter((w) => w.length > 1).map(stem)
    for (const tok of toks) {
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

// Everyday words → the seeded category they belong to. Pure data: extend here,
// never with per-phrase branches. Multi-word phrases win over single words.
// ponytail: keyed by seed category ids; a category the user deleted is simply
// skipped. Upgrade path: per-category `aliases` editable in Settings.
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  'cat-food': ['coffee', 'lunch', 'dinner', 'breakfast', 'brunch', 'snack', 'groceries', 'grocery', 'meal', 'eat', 'restaurant', 'cafe', 'tea', 'drink', 'water', 'seven', '7 11', 'bubble tea', 'noodle', 'rice', 'pizza', 'burger', 'kfc', 'grab food', 'foodpanda', 'lineman', 'fruit', 'milk', 'bakery', 'dessert', 'ice cream', 'market'],
  'cat-rent': ['rent', 'room', 'apartment', 'condo', 'landlord', 'deposit', 'dorm'],
  'cat-utilities': ['electric', 'electricity', 'power', 'water bill', 'internet', 'wifi', 'phone bill', 'sim', 'topup', 'top up', 'ais', 'dtac', 'true', 'bill', 'utilities', 'utility', 'gas'],
  'cat-visa': ['visa', 'immigration', 'extension', 'passport', '90 day', 'work permit', 'embassy', 're entry'],
  'cat-travel': ['travel', 'trip', 'flight', 'grab', 'taxi', 'bolt', 'bts', 'mrt', 'bus', 'train', 'songthaew', 'motorbike', 'moto', 'fuel', 'petrol', 'gas station', 'ticket', 'hotel', 'airbnb', 'uber', 'van', 'boat', 'parking', 'toll'],
  'cat-fun': ['fun', 'movie', 'cinema', 'netflix', 'spotify', 'youtube', 'game', 'gaming', 'steam', 'concert', 'bar', 'beer', 'party', 'club', 'karaoke', 'massage', 'spa', 'gym', 'football', 'pool', 'bowling'],
  'cat-donations': ['donate', 'donation', 'temple', 'monk', 'merit', 'charity', 'alms', 'offering', 'church', 'mosque', 'pagoda'],
  'cat-baydin': ['baydin', 'bay din', 'tarot', 'fortune', 'astrology', 'horoscope', 'reading', 'palm'],
  'cat-treats': ['treat', 'friends', 'friend', 'shout', 'buddies', 'colleagues'],
  'cat-mom': ['mom', 'mother', 'medicine', 'pharmacy', 'hospital', 'doctor', 'clinic', 'meds', 'pills', 'health', 'dentist'],
  'cat-reward': ['reward', 'myself', 'shopping', 'clothes', 'shoes', 'gadget', 'headphones', 'haircut', 'salon', 'skincare', 'self care', 'perfume', 'watch'],
  'cat-misc': ['misc', 'other', 'stuff', 'laundry', 'soap', 'shampoo', 'toiletries', 'household', 'tissue', 'cleaning'],
}
const SYNONYM_LIST = Object.entries(CATEGORY_SYNONYMS)
  .flatMap(([id, words]) => words.map((w) => [w, id] as const))
  .sort((a, b) => b[0].length - a[0].length)

// Category by the user's own category names or by synonym — whichever is
// mentioned EARLIEST wins, so "lunch with mom" is food, not Mom's medicine.
function matchCategory(data: AppData, t: string) {
  const toks = t.split(' ').map(stem)
  const padded = ' ' + t + ' '
  let best: { pos: number; id: string } | null = null
  const consider = (pos: number, id: string) => {
    if (pos >= 0 && (!best || pos < best.pos)) best = { pos, id }
  }
  const direct = matchIn(data.categories, t).best
  if (direct) {
    const words = norm(direct.name).split(' ').filter((w) => w.length > 1).map(stem)
    const pos = toks.findIndex((s) => s.length >= 3 && words.some((w) => s === w || w.startsWith(s) || s.startsWith(w)))
    consider(pos < 0 ? 0 : pos, direct.id)
  }
  for (const [phrase, id] of SYNONYM_LIST) {
    if (phrase.includes(' ')) {
      const i = padded.indexOf(' ' + phrase + ' ')
      if (i >= 0) consider(padded.slice(0, i).split(' ').length - 1, id)
    } else consider(toks.indexOf(stem(phrase)), id)
  }
  return best ? (data.categories.find((c) => c.id === best!.id) ?? null) : null
}

// Accounts named in the sentence, with the word that precedes each mention
// ("to kbank" / "from wise") so transfers need no verb.
function accountMentions(data: AppData, t: string): { acc: Account; pre: string }[] {
  const toks = t.split(' ')
  const stems = toks.map(stem)
  const out: { acc: Account; idx: number; pre: string }[] = []
  for (const acc of data.accounts) {
    const words = norm(acc.name).split(' ').filter((w) => w.length > 1).map(stem)
    const idx = stems.findIndex((s) => s.length >= 3 && words.some((w) => s === w || w.startsWith(s) || s.startsWith(w)))
    if (idx >= 0) out.push({ acc, idx, pre: toks[idx - 1] ?? '' })
  }
  return out.sort((a, b) => a.idx - b.idx)
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
    case 'held_reduce':
    case 'borrow':
    case 'repay':
    case 'lend':
    case 'collect': {
      const p = data.heldParties.find((x) => x.id === tx.personId)?.name ?? '?'
      return {
        held_add: `Held for ${p}`,
        held_reduce: `Returned to ${p}`,
        borrow: `Borrowed from ${p}`,
        repay: `Repaid ${p}`,
        lend: `Lent to ${p}`,
        collect: `${p} paid back`,
      }[tx.type]
    }
  }
}

const SIGN: Record<TxType, string> = {
  income: '+',
  expense: '−',
  transfer: '',
  fund_contribute: '+',
  fund_withdraw: '−',
  held_add: '+',
  held_reduce: '−',
  borrow: '+',
  repay: '−',
  lend: '−',
  collect: '+',
}

const KIND_WORD: Record<TxType, string> = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
  fund_contribute: 'saving',
  fund_withdraw: 'fund withdrawal',
  held_add: 'held money',
  held_reduce: 'held return',
  borrow: 'loan taken',
  repay: 'repayment',
  lend: 'loan given',
  collect: 'loan repaid to you',
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

const lastTx = (data: AppData): Tx | undefined =>
  [...data.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

/* ---------- answers ---------- */

function balanceBlocks(data: AppData): Block[] {
  const legit = netWorthTHB(data)
  const held = heldTotalTHB(data)
  const owe = debtTotalTHB(data)
  const lent = lentTotalTHB(data)
  const inFunds = data.funds.reduce((s, f) => s + fundBalanceTHB(data, f.id), 0)
  return [
    {
      kind: 'stats',
      title: 'Your balances',
      items: [
        { label: `My money (held${owe > 0.005 ? ' & debts' : ''} excluded)`, value: fmtTHB(legit), cls: 'amt-in' },
        { label: 'Total incl. held', value: fmtTHB(legit + held + owe) },
        { label: 'Held for others', value: fmtTHB(held), cls: 'amt-held' },
        ...(owe > 0.005 ? [{ label: 'I owe', value: fmtTHB(owe), cls: 'amt-debt' }] : []),
        ...(lent > 0.005 ? [{ label: 'Owed to me', value: fmtTHB(lent), cls: 'amt-lent' }] : []),
        { label: 'In savings funds', value: fmtTHB(inFunds), cls: 'amt-sav' },
      ],
    },
    {
      kind: 'table',
      columns: ['Account', 'My money', 'Raw'],
      rows: data.accounts.map((a) => {
        const sp = spendable(data.transactions, a.id)
        const raw = accountRaw(data.transactions, a.id)
        const f = (n: number) =>
          fmtMoney(n, a.currency) + (a.currency !== displayCurrency() ? ` (≈${fmtTHB(toTHB(n, a))})` : '')
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

// Debts I owe, loans owed to me, plus held money (also owed back) in one answer.
function debtBlocks(data: AppData, person?: { id: ID; name: string } | null): Block[] {
  if (person) {
    const owe = debtForPartyTHB(data, person.id)
    const lent = lentForPartyTHB(data, person.id)
    const held = heldForPartyTHB(data, person.id)
    const bits = [
      owe > 0.005 ? `you owe ${person.name} ${fmtTHB(owe)}` : '',
      lent > 0.005 ? `${person.name} owes you ${fmtTHB(lent)}` : '',
      held > 0.005 ? `you are holding ${fmtTHB(held)} for ${person.name}` : '',
    ].filter(Boolean)
    const txs = filterTxs(data.transactions, { personId: person.id })
    return [
      text(bits.length ? bits.join(' · ').replace(/^./, (c) => c.toUpperCase()) + '.' : `Nothing outstanding with ${person.name}.`),
      ...(txs.length ? [txTable(data, txs, `${person.name} — history`, 8)] : []),
    ]
  }
  const owe = data.heldParties.map((p) => ({ p, v: debtForPartyTHB(data, p.id) })).filter((x) => x.v > 0.005)
  const lent = data.heldParties.map((p) => ({ p, v: lentForPartyTHB(data, p.id) })).filter((x) => x.v > 0.005)
  const heldTotal = heldTotalTHB(data)
  const blocks: Block[] = []
  if (owe.length)
    blocks.push({
      kind: 'table',
      title: 'You owe',
      columns: ['To', 'Amount'],
      rows: owe.map(({ p, v }) => [p.name, fmtTHB(v)]),
      footer: `Total debt: ${fmtTHB(debtTotalTHB(data))} — already subtracted from “My money”.`,
    })
  if (lent.length)
    blocks.push({
      kind: 'table',
      title: 'Owed to you',
      columns: ['By', 'Amount'],
      rows: lent.map(({ p, v }) => [p.name, fmtTHB(v)]),
      footer: `Total lent out: ${fmtTHB(lentTotalTHB(data))}.`,
    })
  if (heldTotal > 0.005) blocks.push(...heldBlocks(data))
  return blocks.length ? blocks : [text('No debts, no loans, nothing held — all clear. 🎉')]
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
  const cat = matchCategory(data, t)
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
• add 500 food · bought coffee 60 · 45 for lunch
• spent 1200 rent yesterday from kbank
• $20 netflix · 500k mmk food (any of ฿ $ ₫ K, converted at your rates)
• 50 coffee, 120 lunch, 300 grab (several at once)
• add 30000 as salary to kbank
• add 5000 in truemoney (money in, no source)
• 1000 wise to kbank · send 2000 to cash from kbank
• save 500 to education · add 500 to visa · withdraw 200 from visa fund
• 5000 held for Aunt in kbank · returned 2000 to aunt
• borrowed 5000 from ko zaw · repaid 2000 to ko zaw
• lent 1000 to mg mg · mg mg paid me back 500
• … for new person "Ko Denny" (creates them)
• add "note in quotes" or: note lunch with friends
• undo last (deletes the last entry, after you confirm)

📊 Ask me things
• balance · net worth
• spending this month · food spending in june
• income this year · savings
• how much for aunt? · who do I owe? · who owes me?
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

function confirmBlock(data: AppData, tx: Omit<Tx, 'id' | 'createdAt'>, extra = '', newParty?: string): Block {
  const acc = data.accounts.find((a) => a.id === tx.accountId)
  const cur = acc?.currency ?? 'THB'
  const what = newParty ? txLabel(data, tx as Tx).replace('?', newParty) : txLabel(data, tx as Tx)
  const amount = tx.origCurrency
    ? `${fmtMoney(tx.origAmount ?? tx.amount, tx.origCurrency)} (≈ ${fmtMoney(tx.amount, cur)})`
    : `${symbolOf(cur)}${tx.amount.toLocaleString('en-US')}`
  const dateWord = tx.date === todayStr() ? 'today' : fmtDate(tx.date)
  const lead = newParty ? `Create “${newParty}” and add ${KIND_WORD[tx.type]}` : `Add ${KIND_WORD[tx.type]}`
  return {
    kind: 'confirm',
    text: `${lead}: ${amount} · ${what} · ${acc?.name ?? '?'} · ${dateWord}${tx.note ? ` · “${tx.note}”` : ''}${extra}`,
    tx,
    newParty,
  }
}

function parseMutation(data: AppData, raw: string, today: string): Block[] | null {
  const noteRes = extractNote(raw)
  const dateRes = extractDate(noteRes.rest, today)
  const amountRes = extractAmount(dateRes.rest)

  const t = norm(amountRes ? amountRes.rest : dateRes.rest)
  const hasAddVerb =
    /\b(add|spent|spend|paid|pay|bought|buy|got|received|earned|save|saved|withdraw|transfer|move|sent|returned|return|held|holding|keep|borrow(ed)?|lent|lend|repaid|repay|owe)\b/.test(t)
  if (!amountRes) {
    if (hasAddVerb && extractAmount(raw) === null && !/\b(show|list|how|what|report|records|history)\b/.test(t))
      return [text('How much? Try: add 500 food')]
    return null
  }
  const { amount, cur } = amountRes
  const rates: Rates = { ...DEFAULT_RATES, ...data.settings.rates }
  // Amounts are stored in the account's currency; a stated foreign currency converts
  // through ฿ at the shared rates (and the account's own rate for exotic ones).
  const money = (acc: Account) => {
    if (!cur || cur === acc.currency) return { amount }
    const thb = amount * (thbPerUnit(cur, rates) ?? 1)
    return { amount: round2(thb / (acc.fxRateToTHB || 1)), origAmount: amount, origCurrency: cur }
  }
  const base = { date: dateRes.date, note: noteRes.note }
  const withMoney = (acc: Account, rest: Omit<Tx, 'id' | 'createdAt' | 'amount' | 'date' | 'note' | 'accountId'>) => ({
    ...rest,
    ...base,
    ...money(acc),
    accountId: acc.id,
  })

  const person = matchIn(data.heldParties, t).best
  const fund = matchIn(data.funds, t).best

  // transfer: two accounts, with "to/into" (and optionally "from") marking the roles;
  // the verb is optional — "1000 wise to kbank" is enough.
  const mentions = accountMentions(data, t)
  const transferVerb = /\b(transfer|move|send|sent)\b/.test(t)
  if (mentions.length >= 2 || (transferVerb && !fund && !person)) {
    const to = mentions.find((m) => /^(to|into)$/.test(m.pre))
    const from = mentions.find((m) => m.pre === 'from') ?? mentions.find((m) => m !== to)
    if (from && to && from.acc.id !== to.acc.id) {
      const cross = from.acc.currency !== to.acc.currency
      const amt = money(from.acc)
      return [
        confirmBlock(
          data,
          {
            type: 'transfer',
            ...base,
            ...amt,
            accountId: from.acc.id,
            toAccountId: to.acc.id,
            toAmount: cross ? round2((amt.amount * from.acc.fxRateToTHB) / (to.acc.fxRateToTHB || 1)) : undefined,
          },
          cross ? ' · converted at your FX rates' : '',
        ),
      ]
    }
    if (transferVerb)
      return [text(`Which accounts? Try: transfer 1000 ${data.accounts[0]?.name ?? 'wise'} to ${data.accounts[1]?.name ?? 'kbank'}`)]
  }

  // money with a party: held (custodial), borrowed/repaid, lent/collected
  const heldWords = /\b(held|holding|hold|keeps?|park(ed)?)\b/.test(t)
  const borrowWords = /\b(borrow(ed|s)?|owe)\b/.test(t)
  const lendWords = /\b(lend|lent|loan(ed|s)?)\b/.test(t)
  const repayWords = /\brepa(y|id|yment)\b/.test(t)
  const collectWords = /\bcollect(ed)?\b/.test(t)
  const backWords = /\b(return(ed)?|back)\b/.test(t)
  // "X paid me back" / "got 500 back from X" / "X returned it to me" → money came to me
  const toMe = /\b(paid|pay|gave|give|sent|send|returned|return)\s+(me|it to me)\b|\b(got|received|collected)\b|\bback\s+from\b|\bto\s+me\b/.test(t)
  const partyCue = heldWords || borrowWords || lendWords || repayWords || collectWords || backWords || /\bfor\b/.test(t)

  const newName = noteRes.note?.trim()
  const newParty = person === null && partyCue && !!newName && /\b(new|create|person|someone)\b/.test(t) ? newName : undefined

  if (person || newParty || heldWords || borrowWords || lendWords || repayWords || collectWords) {
    const p = person ?? (newParty ? null : (data.heldParties.find((x) => x.isPrimary) ?? data.heldParties[0]))
    if (!p && !newParty) return [text('Add a person first (More → Debts & Loans → + Person), then tell me again.')]
    const pid = p?.id ?? ''
    const owe = p ? debtForPartyTHB(data, pid) : 0
    const held = p ? heldForPartyTHB(data, pid) : 0
    const personIdx = p ? t.indexOf(norm(p.name).split(' ')[0]!) : -1
    const verbIdx = t.search(/\b(borrow|lend|lent|loan)/)

    let type: TxType | null = null
    if (borrowWords) type = personIdx >= 0 && verbIdx > personIdx && !/\bfrom\b/.test(t) && !/\bi\b/.test(t) ? 'lend' : 'borrow'
    else if (lendWords) type = 'lend'
    else if (repayWords) type = 'repay'
    else if (collectWords || (backWords && toMe)) type = 'collect'
    else if (backWords) type = held > 0.005 ? 'held_reduce' : owe > 0.005 ? 'repay' : 'held_reduce'
    else if (heldWords || /\b(sent|sends|for)\b/.test(t)) type = 'held_add'

    if (type) {
      // party money usually lands where it already sits; else the named/last-used account
      const acc =
        pickAccount(data, t) ??
        (p
          ? [...data.accounts].sort(
              (a, b) => heldPartyInAccount(data.transactions, pid, b.id) - heldPartyInAccount(data.transactions, pid, a.id),
            )[0]
          : undefined) ??
        defaultAccount(data)
      const assumed = person || newParty ? '' : ` · assumed ${p!.name}`
      return [confirmBlock(data, withMoney(acc, { type, personId: pid }), assumed, newParty)]
    }
  }

  // savings funds: a save-verb, or "to/into <fund>"
  if (fund) {
    const fundFirst = norm(fund.name).split(' ')[0]!
    const toFund = new RegExp(`\\b(to|into)\\s+(the\\s+|my\\s+)?${fundFirst}`).test(t)
    if (/\b(save|saved|saving|fund|withdraw|withdrew|took?)\b/.test(t) || toFund) {
      const type = /\b(withdraw|withdrew|took?)\b/.test(t) ? 'fund_withdraw' : 'fund_contribute'
      const acc = pickAccount(data, t) ?? data.accounts.find((a) => a.id === fund.accountId) ?? defaultAccount(data)
      return [confirmBlock(data, withMoney(acc, { type, fundId: fund.id }))]
    }
  }

  // income
  const source = matchIn(data.incomeSources, t).best
  if (source && (/\b(as|from|income|received|got|earned)\b/.test(t) || norm(source.name).split(' ').some((w) => t.includes(w)))) {
    const acc = pickAccount(data, t) ?? defaultAccount(data)
    return [confirmBlock(data, withMoney(acc, { type: 'income', sourceId: source.id }))]
  }

  const cat = matchCategory(data, t)
  const namedAcc = pickAccount(data, t)

  // "add 500 in truemoney" — an amount landing in a named account, with no category
  // and no spend word, reads as money coming IN (income), not an expense.
  if (!cat && namedAcc && !/\b(spent|spend|paid|pay|bought|buy)\b/.test(t)) {
    return [confirmBlock(data, withMoney(namedAcc, { type: 'income' }), ' · no source tagged')]
  }

  // expense (default)
  const acc = namedAcc ?? defaultAccount(data)
  const misc = data.categories.find((c) => c.id === 'cat-misc') ?? data.categories[data.categories.length - 1]
  if (!cat && !misc) return [text('Add a category first, then tell me again.')]
  return [
    confirmBlock(
      data,
      withMoney(acc, { type: 'expense', categoryId: (cat ?? misc)!.id }),
      cat ? '' : ` · no category matched, using ${misc!.name}`,
    ),
  ]
}

// "50 coffee, 120 lunch and 300 grab" → one proposal per part, but only when every
// part carries its own amount (so "dinner with mom and dad 500" stays one entry).
function parseMulti(data: AppData, input: string, today: string): Block[] | null {
  // a comma between digits is a thousands separator, not a list
  const parts = input.split(/\s*(?:(?<!\d),|,(?!\d)|;|\band\b)\s*/).filter(Boolean)
  if (parts.length < 2 || !parts.every((p) => extractAmount(p))) return null
  const blocks = parts.map((p) => parseMutation(data, p, today))
  return blocks.every(Boolean) ? blocks.flatMap((b) => b!) : null
}

/* ---------- main entry ---------- */

export function assist(data: AppData, input: string): Block[] {
  const today = todayStr()
  const raw = norm(input)
  if (input.trim() === '?' || /^(help|commands?|what can you do|how do i .*)$/.test(raw)) return [text(HELP)]
  if (!raw) return [text('Type a command or question — or say "help".')]

  if (/^(undo|undo last|(delete|remove) (the )?last( entry| record| one)?)$/.test(raw)) {
    const tx = lastTx(data)
    if (!tx) return [text('Nothing to undo — the ledger is empty.')]
    const acc = data.accounts.find((a) => a.id === tx.accountId)
    return [
      {
        kind: 'delete',
        text: `Delete the last entry? ${SIGN[tx.type]}${fmtMoney(tx.amount, acc?.currency)} · ${txLabel(data, tx)} · ${acc?.name ?? '?'} · ${tx.date === today ? 'today' : fmtDate(tx.date)}`,
        txId: tx.id,
      },
    ]
  }

  // queries first when clearly interrogative / no amount
  const isQuery = /\b(how much|how many|show|list|what|who|balance|net worth|report|records|history|biggest|largest|top|left|remaining|status)\b/.test(raw)

  if (!isQuery) {
    const mutation = parseMulti(data, input, today) ?? parseMutation(data, input, today)
    if (mutation) return mutation
  }

  if (/\b(balance|net worth|have|worth)\b/.test(raw) && !/\bfund|held|hold|owe\b/.test(raw)) return balanceBlocks(data)
  const heldPerson = matchIn(data.heldParties, raw).best
  // "how much for aunt?" names a person without a hold/owe keyword — still a held query,
  // unless it clearly belongs to another intent (spending, reports, transfers…).
  const asksHeldPerson =
    !!heldPerson &&
    /\b(how much|how many|for|owe)\b/.test(raw) &&
    !/(spen|budget|report|saving|income|transfer|balance)/.test(raw)
  if (/\b(owe|owed|debts?|borrow(ed)?|lent|loans?|owes)\b/.test(raw)) return debtBlocks(data, heldPerson)
  if (/\b(hold|held|holding)\b/.test(raw) || asksHeldPerson) {
    if (heldPerson) {
      const total = heldForPartyTHB(data, heldPerson.id)
      const txs = filterTxs(data.transactions, { personId: heldPerson.id, types: ['held_add', 'held_reduce'] })
      return [
        text(`You are holding ${fmtTHB(total)} for ${heldPerson.name}.`),
        ...(txs.length ? [txTable(data, txs, `${heldPerson.name} — history`, 8)] : []),
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
    const cat = matchCategory(data, raw)
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
  const mutation = parseMulti(data, input, today) ?? parseMutation(data, input, today)
  if (mutation) return mutation

  return [text(`I didn't catch that. Try "add 500 food", "spending this month", or say "help" for everything I understand.`)]
}

/* ---------- post-save summary (used by the chat after a confirmed add) ---------- */

export function afterSaveLine(data: AppData, tx: Omit<Tx, 'id' | 'createdAt'>): string {
  const acc = data.accounts.find((a) => a.id === tx.accountId)
  const thb = toTHB(tx.amount, acc)
  const p = data.heldParties.find((x) => x.id === tx.personId)?.name ?? 'them'
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
    const now = heldForPartyTHB(data, tx.personId!) + (tx.type === 'held_add' ? thb : -thb)
    return `Saved ✓ Now holding ${fmtTHB(now)} for ${p}.`
  }
  if (tx.type === 'borrow' || tx.type === 'repay') {
    const now = debtForPartyTHB(data, tx.personId!) + (tx.type === 'borrow' ? thb : -thb)
    return now > 0.005 ? `Saved ✓ You now owe ${p} ${fmtTHB(now)}.` : `Saved ✓ You're square with ${p}. 🎉`
  }
  if (tx.type === 'lend' || tx.type === 'collect') {
    const now = lentForPartyTHB(data, tx.personId!) + (tx.type === 'lend' ? thb : -thb)
    return now > 0.005 ? `Saved ✓ ${p} now owes you ${fmtTHB(now)}.` : `Saved ✓ ${p} has paid you back in full. 🎉`
  }
  if (tx.type === 'fund_contribute' || tx.type === 'fund_withdraw') {
    const f = data.funds.find((x) => x.id === tx.fundId)
    const now = fundBalanceTHB(data, tx.fundId!) + (tx.type === 'fund_contribute' ? thb : -thb)
    return `Saved ✓ ${f?.name ?? 'Fund'}: ${fmtTHB(now)}${f?.target ? ` of ${fmtTHB(f.target)}` : ''}.`
  }
  if (tx.type === 'income') return `Saved ✓ ${fmtTHB(thb)} in. Net worth: ${fmtTHB(netWorthTHB(data) + thb)}.`
  return 'Saved ✓'
}
