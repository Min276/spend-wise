export type ID = string

export interface Account {
  id: ID
  name: string
  type: string
  currency: string
  fxRateToTHB: number
  icon: string
  color: string
}

export interface IncomeSource {
  id: ID
  name: string
}

export interface Category {
  id: ID
  name: string
  icon: string
  color: string
}

export interface Fund {
  id: ID
  name: string
  icon: string
  color: string
  target?: number
  deadline?: string
  accountId?: ID
}

export interface HeldParty {
  id: ID
  name: string
  isPrimary?: boolean
}

export type TxType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'fund_contribute'
  | 'fund_withdraw'
  | 'held_add'
  | 'held_reduce'
  | 'borrow'
  | 'repay'
  | 'lend'
  | 'collect'

// Money that changes hands with a party: held (custodial) and debt (borrow/repay,
// lend/collect) types all tag the party via personId.
export const DEBT_TYPES: TxType[] = ['borrow', 'repay', 'lend', 'collect']

export interface Tx {
  id: ID
  type: TxType
  amount: number
  date: string
  accountId: ID
  note?: string
  createdAt: string
  updatedAt?: string
  sourceId?: ID
  recurring?: boolean
  categoryId?: ID
  toAccountId?: ID
  toAmount?: number
  fundId?: ID
  personId?: ID
  // When the amount was typed in another currency: what was entered, for display/edit.
  origAmount?: number
  origCurrency?: string
}

export interface Budgets {
  dailyLimit?: number
  monthlyBudget?: number
  perCategory: Record<ID, number>
}

// A saved quick-add entry. `preset` prefills the add sheet (or is auto-posted).
// When `repeatDay` is set it posts once a month on that day; `lastPosted` (YYYY-MM)
// dedupes so it never double-posts within a month.
export interface Template {
  id: ID
  label: string
  preset: Partial<Tx>
  repeatDay?: number
  lastPosted?: string
}

export type ReminderId =
  | 'morningBrief'
  | 'eveningBrief'
  | 'checkinMorning'
  | 'checkinAfternoon'
  | 'checkinEvening'
  | 'checkinNight'

export interface ReminderSetting {
  enabled: boolean
  time: string
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  seedV?: number
  hideAmounts?: boolean
  accent?: string
  defaultPeriod?: 'day' | 'month' | 'year'
  showFx?: boolean
  heroStats?: Record<string, boolean>
  density?: 'comfortable' | 'compact'
  lastUsedAccountId?: ID
  currency?: string
  rates?: { USD: number; VND: number; MMK: number }
  thresholdNotifs: boolean
  reminders: Record<ReminderId, ReminderSetting>
  firedKeys: Record<string, string>
}

export interface AppData {
  schema: 1
  accounts: Account[]
  incomeSources: IncomeSource[]
  categories: Category[]
  funds: Fund[]
  heldParties: HeldParty[]
  transactions: Tx[]
  templates: Template[]
  budgets: Budgets
  settings: Settings
}

export interface EntityMap {
  accounts: Account
  incomeSources: IncomeSource
  categories: Category
  funds: Fund
  heldParties: HeldParty
}

export type EntityKind = keyof EntityMap
