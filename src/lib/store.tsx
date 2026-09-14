import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { AppData, Budgets, EntityKind, EntityMap, ID, Settings, Template, Tx } from './types.ts'
import { seedData } from './seed.ts'
import { setDisplay } from './format.ts'
import { isImportable, normalizeData, reducer, type Action } from './reducer.ts'

export { isImportable, normalizeData, reducer, type Action }

const KEY = 'spendwise:v1'

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
  addTemplate(t: Omit<Template, 'id'>): void
  updateTemplate(t: Template): void
  deleteTemplate(id: ID): void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadData)
  // Display currency for every fmtTHB below us — set during render so children
  // never format with a stale currency (see format.ts).
  setDisplay(data.settings)

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

  const accent = data.settings.accent
  useEffect(() => {
    document.documentElement.dataset.accent = accent || 'teal'
  }, [accent])

  const density = data.settings.density
  useEffect(() => {
    document.documentElement.dataset.density = density || 'comfortable'
  }, [density])

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
      addTemplate: (t) => dispatch({ type: 'template/add', template: { ...t, id: crypto.randomUUID() } }),
      updateTemplate: (t) => dispatch({ type: 'template/update', template: t }),
      deleteTemplate: (id) => dispatch({ type: 'template/delete', id }),
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
