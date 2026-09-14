import type { AppData, Budgets, EntityKind, EntityMap, ID, Settings, Template, Tx } from './types.ts'
import { defaultSettings, migrateAccountsV2, seedData } from './seed.ts'
import { shiftDate, todayStr } from './money.ts'
import { applyRates, DEFAULT_RATES } from './format.ts'

// Pure state machine for the app blob — no React, no storage — so the
// self-checks can drive it directly.

export type Action =
  | { type: 'tx/add'; tx: Tx }
  | { type: 'tx/update'; tx: Tx }
  | { type: 'tx/delete'; id: ID }
  | { type: 'entity/add'; kind: EntityKind; item: EntityMap[EntityKind] }
  | { type: 'entity/update'; kind: EntityKind; item: EntityMap[EntityKind] }
  | { type: 'entity/delete'; kind: EntityKind; id: ID; reassignTo?: ID }
  | { type: 'budgets/set'; budgets: Budgets }
  | { type: 'settings/patch'; patch: Partial<Settings> }
  | { type: 'alerts/fired'; keys: string[] }
  | { type: 'template/add'; template: Template }
  | { type: 'template/update'; template: Template }
  | { type: 'template/delete'; id: ID }
  | { type: 'data/import'; data: AppData }
  | { type: 'data/reset' }

export function normalizeData(d: Partial<AppData>): AppData {
  const seed = seedData()
  const defaults = defaultSettings()
  const storedSeedV = d.settings?.seedV ?? 1
  let accounts = d.accounts ?? seed.accounts
  if (storedSeedV < 2) accounts = migrateAccountsV2(accounts)
  const rates = { ...DEFAULT_RATES, ...d.settings?.rates }
  return {
    ...seed,
    ...d,
    accounts: applyRates(accounts, rates),
    schema: 1,
    settings: {
      ...defaults,
      ...d.settings,
      seedV: 2,
      rates,
      reminders: { ...defaults.reminders, ...d.settings?.reminders },
      firedKeys: d.settings?.firedKeys ?? {},
    },
    budgets: { perCategory: {}, ...d.budgets },
  }
}

export function isImportable(d: unknown): d is Partial<AppData> {
  return (
    !!d &&
    typeof d === 'object' &&
    Array.isArray((d as AppData).accounts) &&
    Array.isArray((d as AppData).transactions)
  )
}

const REF_FIELD: Record<Exclude<EntityKind, 'accounts'>, keyof Tx> = {
  incomeSources: 'sourceId',
  categories: 'categoryId',
  funds: 'fundId',
  heldParties: 'personId',
}

function deleteEntity(state: AppData, kind: EntityKind, id: ID, reassignTo?: ID): AppData {
  const next: AppData = { ...state, [kind]: state[kind].filter((x) => x.id !== id) }
  if (kind === 'accounts') {
    next.transactions = reassignTo
      ? state.transactions.map((tx) => {
          if (tx.accountId !== id && tx.toAccountId !== id) return tx
          return {
            ...tx,
            accountId: tx.accountId === id ? reassignTo : tx.accountId,
            toAccountId: tx.toAccountId === id ? reassignTo : tx.toAccountId,
          }
        })
      : state.transactions.filter((tx) => tx.accountId !== id && tx.toAccountId !== id)
    if (state.settings.lastUsedAccountId === id)
      next.settings = { ...state.settings, lastUsedAccountId: undefined }
  } else {
    const field = REF_FIELD[kind]
    next.transactions = reassignTo
      ? state.transactions.map((tx) => (tx[field] === id ? { ...tx, [field]: reassignTo } : tx))
      : state.transactions.filter((tx) => tx[field] !== id)
  }
  if (kind === 'categories' && state.budgets.perCategory[id]) {
    const perCategory = { ...state.budgets.perCategory }
    delete perCategory[id]
    next.budgets = { ...state.budgets, perCategory }
  }
  return next
}

const rates = (s: Pick<AppData, 'settings'>) => ({ ...DEFAULT_RATES, ...s.settings.rates })

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'tx/add':
      return {
        ...state,
        transactions: [...state.transactions, action.tx],
        settings: { ...state.settings, lastUsedAccountId: action.tx.accountId },
      }
    case 'tx/update':
      return {
        ...state,
        transactions: state.transactions.map((t) => (t.id === action.tx.id ? action.tx : t)),
      }
    case 'tx/delete':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) }
    case 'entity/add': {
      const next = { ...state, [action.kind]: [...state[action.kind], action.item] }
      return action.kind === 'accounts' ? { ...next, accounts: applyRates(next.accounts, rates(state)) } : next
    }
    case 'entity/update': {
      const next = {
        ...state,
        [action.kind]: state[action.kind].map((x) => (x.id === action.item.id ? action.item : x)),
      }
      return action.kind === 'accounts' ? { ...next, accounts: applyRates(next.accounts, rates(state)) } : next
    }
    case 'entity/delete':
      return deleteEntity(state, action.kind, action.id, action.reassignTo)
    case 'budgets/set':
      return { ...state, budgets: action.budgets }
    case 'settings/patch': {
      const settings = { ...state.settings, ...action.patch }
      return {
        ...state,
        settings,
        accounts: action.patch.rates ? applyRates(state.accounts, rates({ settings })) : state.accounts,
      }
    }
    case 'alerts/fired': {
      const today = todayStr()
      const cutoff = shiftDate(today, -62)
      const firedKeys: Record<string, string> = {}
      for (const [k, v] of Object.entries(state.settings.firedKeys)) if (v >= cutoff) firedKeys[k] = v
      for (const k of action.keys) firedKeys[k] = today
      return { ...state, settings: { ...state.settings, firedKeys } }
    }
    case 'template/add':
      return { ...state, templates: [...state.templates, action.template] }
    case 'template/update':
      return { ...state, templates: state.templates.map((t) => (t.id === action.template.id ? action.template : t)) }
    case 'template/delete':
      return { ...state, templates: state.templates.filter((t) => t.id !== action.id) }
    case 'data/import':
      return normalizeData(action.data)
    case 'data/reset':
      return seedData()
  }
}
