import assert from 'node:assert/strict'
import type { AppData, Tx } from '../src/lib/types.ts'
import { seedData } from '../src/lib/seed.ts'
import { assist, type Block } from '../src/lib/assistant.ts'
import { shiftDate, todayStr } from '../src/lib/money.ts'

// Real-world scenario harness for the offline assistant brain. assist() is pure,
// so one seeded AppData is reused across every case. MUST cases lock in behaviour
// (a failure = a real bug); GAPS document natural phrasings we don't handle yet.

const today = todayStr()
const yday = shiftDate(today, -1)

let seq = 0
const mk = (t: Partial<Tx> & Pick<Tx, 'type' | 'amount' | 'accountId'>): Tx => ({
  id: `h${++seq}`,
  date: today,
  createdAt: '2026-01-01T00:00:00Z',
  ...t,
})

// Seed a little history so balance / held / spend queries have something to answer.
const data: AppData = {
  ...seedData(),
  transactions: [
    mk({ type: 'income', amount: 40000, accountId: 'acc-kbank', sourceId: 'src-salary' }),
    mk({ type: 'expense', amount: 1200, accountId: 'acc-kbank', categoryId: 'cat-rent' }),
    mk({ type: 'expense', amount: 350, accountId: 'acc-tmn', categoryId: 'cat-food' }),
    mk({ type: 'expense', amount: 90, accountId: 'acc-tmn', categoryId: 'cat-travel', date: yday }),
    mk({ type: 'held_add', amount: 5000, accountId: 'acc-kbank', personId: 'aunt' }),
    mk({ type: 'held_reduce', amount: 2000, accountId: 'acc-kbank', personId: 'aunt' }),
    mk({ type: 'fund_contribute', amount: 3000, accountId: 'acc-kbank', fundId: 'fund-education' }),
  ],
}

type TxExpect = Partial<
  Pick<Tx, 'type' | 'amount' | 'accountId' | 'categoryId' | 'sourceId' | 'fundId' | 'personId' | 'toAccountId' | 'date' | 'note'>
>

const confirmTx = (blocks: Block[]) => {
  const c = blocks.find((b) => b.kind === 'confirm')
  return c && c.kind === 'confirm' ? c.tx : null
}
const firstText = (blocks: Block[]) => {
  const t = blocks.find((b) => b.kind === 'text')
  return t && t.kind === 'text' ? t.text : ''
}
const summary = (blocks: Block[]) =>
  blocks
    .map((b) =>
      b.kind === 'confirm' ? `confirm:${b.tx.type}` : b.kind === 'text' ? `text:"${b.text.slice(0, 32)}"` : b.kind,
    )
    .join(' | ') || '(empty)'

const failures: string[] = []
let passed = 0

function record(input: string, blocks: Block[], run: () => void) {
  try {
    run()
    passed++
  } catch (e) {
    failures.push(`  ✗ "${input}" → ${(e as Error).message}   [got: ${summary(blocks)}]`)
  }
}

function expectConfirm(input: string, want: TxExpect) {
  const blocks = assist(data, input)
  record(input, blocks, () => {
    const tx = confirmTx(blocks)
    assert.ok(tx, 'expected a confirm block')
    for (const [k, v] of Object.entries(want)) assert.equal((tx as Record<string, unknown>)[k], v, `field ${k}`)
  })
}

function expectAnswer(input: string, kinds: Block['kind'][] = []) {
  const blocks = assist(data, input)
  record(input, blocks, () => {
    assert.ok(blocks.length > 0, 'empty answer')
    assert.ok(!blocks.some((b) => b.kind === 'confirm'), 'a query must never propose a transaction')
    for (const k of kinds) assert.ok(blocks.some((b) => b.kind === k), `expected a ${k} block`)
  })
}

function expectTextIncludes(input: string, needle: string) {
  const blocks = assist(data, input)
  record(input, blocks, () => {
    assert.ok(!blocks.some((b) => b.kind === 'confirm'), 'unexpectedly proposed a transaction')
    assert.ok(firstText(blocks).toLowerCase().includes(needle.toLowerCase()), `expected text mentioning "${needle}"`)
  })
}

/* ---------- MUST: add-commands across every transaction type ---------- */
expectConfirm('add 500 food', { type: 'expense', amount: 500, categoryId: 'cat-food' })
expectConfirm('spent 1200 rent yesterday from kbank', { type: 'expense', amount: 1200, categoryId: 'cat-rent', date: yday, accountId: 'acc-kbank' })
expectConfirm('paid 800 for electricity', { type: 'expense', amount: 800, categoryId: 'cat-utilities' })
expectConfirm('150 travel', { type: 'expense', amount: 150, categoryId: 'cat-travel' })
expectConfirm('spent 500', { type: 'expense', amount: 500, categoryId: 'cat-misc' })

// "add <amount> in/to <account>" with no category or spend verb = money coming in
expectConfirm('add 500 in truemoney', { type: 'income', amount: 500, accountId: 'acc-tmn' })
expectConfirm('add 1000 to kbank', { type: 'income', amount: 1000, accountId: 'acc-kbank' })
expectConfirm('add 500 food in truemoney', { type: 'expense', amount: 500, categoryId: 'cat-food', accountId: 'acc-tmn' })
expectConfirm('spent 500 from truemoney', { type: 'expense', amount: 500, accountId: 'acc-tmn', categoryId: 'cat-misc' })
expectConfirm('add 30000 as salary to kbank', { type: 'income', amount: 30000, sourceId: 'src-salary', accountId: 'acc-kbank' })
expectConfirm('got paid 25000 salary', { type: 'income', amount: 25000, sourceId: 'src-salary' })
expectConfirm('received 5000 freelance', { type: 'income', amount: 5000, sourceId: 'src-freelance' })
expectConfirm('salary 30000', { type: 'income', amount: 30000, sourceId: 'src-salary' })
expectConfirm('5000 held for aunt in kbank', { type: 'held_add', amount: 5000, personId: 'aunt', accountId: 'acc-kbank' })
expectConfirm('returned 2000 to aunt', { type: 'held_reduce', amount: 2000, personId: 'aunt' })
expectConfirm('aunt gave me 3000 to keep', { type: 'held_add', amount: 3000, personId: 'aunt' })
expectConfirm('give back 1000 to aunt', { type: 'held_reduce', amount: 1000, personId: 'aunt' })
expectConfirm('gave 1500 back to aunt', { type: 'held_reduce', amount: 1500, personId: 'aunt' })
// create a brand-new held person inline from a quoted name + a "new/create" word
{
  const input = 'hold 2500 in kbank for new person "Ko Denny"'
  const blocks = assist(data, input)
  record(input, blocks, () => {
    const c = blocks.find((b) => b.kind === 'confirm')
    assert.ok(c && c.kind === 'confirm', 'expected a confirm block')
    assert.equal(c.newParty, 'Ko Denny', 'proposes creating the new party')
    assert.equal(c.tx.type, 'held_add', 'as held money')
    assert.equal(c.tx.amount, 2500, 'amount 2500')
    assert.equal(c.tx.accountId, 'acc-kbank', 'in the named account')
  })
}
expectConfirm('save 500 to education', { type: 'fund_contribute', amount: 500, fundId: 'fund-education' })
expectConfirm('withdraw 200 from visa fund', { type: 'fund_withdraw', amount: 200, fundId: 'fund-visa' })
expectConfirm('saved 2000 for education', { type: 'fund_contribute', amount: 2000, fundId: 'fund-education' })
expectConfirm('took 300 out of visa savings', { type: 'fund_withdraw', amount: 300, fundId: 'fund-visa' })
expectConfirm('transfer 1000 wise to kbank', { type: 'transfer', amount: 1000, accountId: 'acc-wise', toAccountId: 'acc-kbank' })
expectConfirm('move 500 from kbank to cash', { type: 'transfer', amount: 500, accountId: 'acc-kbank', toAccountId: 'acc-cash' })

/* ---------- MUST: amount / date / note parsing ---------- */
expectConfirm('add 1.5k travel', { type: 'expense', amount: 1500, categoryId: 'cat-travel' })
expectConfirm('50k rent', { type: 'expense', amount: 50000, categoryId: 'cat-rent' })
expectConfirm('add ฿250 food', { type: 'expense', amount: 250, categoryId: 'cat-food' })
expectConfirm('spent 1,250 on rent', { type: 'expense', amount: 1250, categoryId: 'cat-rent' })
expectConfirm('add 200 food from kbank note dinner with mom', { type: 'expense', amount: 200, categoryId: 'cat-food', accountId: 'acc-kbank', note: 'dinner with mom' })

/* ---------- MUST: queries answer, never mutate ---------- */
expectAnswer('balance', ['table'])
expectAnswer('net worth', ['table'])
expectAnswer('how much did i spend this month')
expectAnswer('food spending in june')
expectAnswer('income this year')
expectAnswer('savings', ['table'])
expectTextIncludes('how much for aunt', 'aunt')
expectAnswer('who do i owe', ['table'])
expectAnswer('budget left')
expectAnswer('report this month', ['stats'])
expectAnswer('report june', ['stats'])
expectAnswer('show travel records', ['table'])
expectAnswer('last records', ['table'])
expectAnswer('biggest expenses', ['table'])

/* ---------- MUST: non-actions ---------- */
expectTextIncludes('', 'command')
expectTextIncludes('help', 'add money')
expectTextIncludes('?', 'add money')
expectTextIncludes('add food', 'how much')

/* ---------- fuzz: never throws, always returns something renderable ---------- */
for (const s of ['', 'help', '?', 'add food', 'asdfghjkl qwerty', '💰💰', '1000000000', 'spent -5 food', 'add 0 food', 'the quick brown fox']) {
  const blocks = assist(data, s)
  assert.ok(Array.isArray(blocks) && blocks.length > 0, `assist returned nothing for ${JSON.stringify(s)}`)
  assert.ok(
    blocks.every((b) => ['text', 'stats', 'table', 'confirm'].includes(b.kind)),
    `assist returned an unknown block kind for ${JSON.stringify(s)}`,
  )
}

/* ---------- known NLU gaps: natural phrasings we don't handle yet (non-fatal) ---------- */
const GAPS: { input: string; note: string }[] = [
  { input: 'bought coffee 60', note: 'no synonym map: "coffee/lunch/dinner/groceries" should map to Daily Meals & Food' },
  { input: 'add 45 for lunch', note: 'same — everyday food words fall through to Misc' },
  { input: 'add 500 to education', note: '"to <fund>" without a save-verb is read as an expense, not a fund contribution' },
  { input: '1000 wise to kbank', note: 'transfers require the literal word "transfer"/"move"' },
  { input: 'send 2000 to truemoney from kbank', note: '"send X to Y from Z" is not parsed as a transfer' },
  { input: 'donated 300', note: 'no stemming: "donated" should reach the Donations category' },
  { input: 'aunt paid me back 500', note: 'a non-adjacent "...back" is not detected as a return' },
]

console.log(`Known NLU gaps (natural phrasing, future work — ${GAPS.length}):`)
for (const g of GAPS) console.log(`  • "${g.input}" — ${g.note}\n      now → ${summary(assist(data, g.input))}`)

if (failures.length) {
  console.error(`\n✗ assistant.check: ${failures.length} of ${passed + failures.length} scenarios FAILED:`)
  for (const f of failures) console.error(f)
  process.exit(1)
}
console.log(`\n✓ assistant.check: all ${passed} scenarios passed`)
