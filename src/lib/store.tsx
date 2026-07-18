import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { AppData, Budgets, EntityKind, EntityMap, ID, Settings, Tx } from './types.ts'
import { defaultSettings, migrateAccountsV2, seedData } from './seed.ts'
import { shiftDate, todayStr } from './money.ts'

const KEY = 'spendwise:v1'

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
  | { type: 'data/import'; data: AppData }
  | { type: 'data/reset' }

export function normalizeData(d: Partial<AppData>): AppData {
  const seed = seedData()
  const defaults = defaultSettings()
  const storedSeedV = d.settings?.seedV ?? 1
  let accounts = d.accounts ?? seed.accounts
  if (storedSeedV < 2) accounts = migrateAccountsV2(accounts)
  return {
    ...seed,
    ...d,
    accounts,
    schema: 1,
    settings: {
      ...defaults,
      ...d.settings,
      seedV: 2,
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

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (isImportable(d)) return normalizeData(d)
    }
  } catch {
    // corrupted storage falls through to a fresh seed
  }
  return seedData()
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
    case 'entity/add':
      return { ...state, [action.kind]: [...state[action.kind], action.item] }
    case 'entity/update':
      return {
        ...state,
        [action.kind]: state[action.kind].map((x) => (x.id === action.item.id ? action.item : x)),
      }
    case 'entity/delete':
      return deleteEntity(state, action.kind, action.id, action.reassignTo)
    case 'budgets/set':
      return { ...state, budgets: action.budgets }
    case 'settings/patch':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'alerts/fired': {
      const today = todayStr()
      const cutoff = shiftDate(today, -62)
      const firedKeys: Record<string, string> = {}
      for (const [k, v] of Object.entries(state.settings.firedKeys)) if (v >= cutoff) firedKeys[k] = v
      for (const k of action.keys) firedKeys[k] = today
      return { ...state, settings: { ...state.settings, firedKeys } }
    }
    case 'data/import':
      return normalizeData(action.data)
    case 'data/reset':
      return seedData()
  }
}

export interface Store {
  data: AppData
  dispatch: Dispatch<Action>
  addTx(tx: Omit<Tx, 'id' | 'createdAt'>): void
  updateTx(tx: Tx): void
  deleteTx(id: ID): void
  addEntity<K extends EntityKind>(kind: K, item: Omit<EntityMap[K], 'id'>): ID
  updateEntity<K extends EntityKind>(kind: K, item: EntityMap[K]): void
  deleteEntity(kind: EntityKind, id: ID, reassignTo?: ID): void
  setBudgets(budgets: Budgets): void
  patchSettings(patch: Partial<Settings>): void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadData)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data))
      } catch {
        // storage full/unavailable — data stays in memory
      }
    }, 250)
    return () => clearTimeout(t)
  }, [data])

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  const hideAmounts = !!data.settings.hideAmounts
  useEffect(() => {
    document.documentElement.dataset.privacy = hideAmounts ? 'on' : 'off'
  }, [hideAmounts])

  const theme = data.settings.theme
  useEffect(() => {
    const apply = () => {
      const dark =
        theme === 'dark' ||
        (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const store = useMemo<Store>(
    () => ({
      data,
      dispatch,
      addTx: (tx) =>
        dispatch({
          type: 'tx/add',
          tx: { ...tx, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
        }),
      updateTx: (tx) =>
        dispatch({ type: 'tx/update', tx: { ...tx, updatedAt: new Date().toISOString() } }),
      deleteTx: (id) => dispatch({ type: 'tx/delete', id }),
      addEntity: (kind, item) => {
        const id = crypto.randomUUID()
        dispatch({ type: 'entity/add', kind, item: { ...item, id } })
        return id
      },
      updateEntity: (kind, item) => dispatch({ type: 'entity/update', kind, item }),
      deleteEntity: (kind, id, reassignTo) => dispatch({ type: 'entity/delete', kind, id, reassignTo }),
      setBudgets: (budgets) => dispatch({ type: 'budgets/set', budgets }),
      patchSettings: (patch) => dispatch({ type: 'settings/patch', patch }),
    }),
    [data],
  )

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const store = useContext(Ctx)
  if (!store) throw new Error('useStore outside StoreProvider')
  return store
}
