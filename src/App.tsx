import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { SyncProvider } from './lib/sync'
import { SheetCtx } from './lib/sheet'
import { useRoute } from './lib/router'
import { newAlerts } from './lib/alerts'
import { notifyAlert, startReminderScheduler } from './lib/notify'
import { AddSheet, type SheetOpts } from './components/AddSheet'
import { TabBar } from './components/TabBar'
import { ToastProvider, useToast } from './components/Toasts'
import { Icon } from './components/Icons'
import { Dashboard } from './screens/Dashboard'
import { Ledger } from './screens/Ledger'
import { More } from './screens/More'
import { Settings } from './screens/Settings'
import { ManageAccounts, ManageCategories, ManagePeople, ManageSources } from './screens/Manage'
import { Funds } from './screens/Funds'
import { Held, HeldHistory } from './screens/Held'
import { Debts, DebtHistory } from './screens/Debts'
import { Budgets } from './screens/Budgets'
import { NotifSettings } from './screens/NotifSettings'
import { Currency } from './screens/Currency'
import { Templates } from './screens/Templates'
import { todayStr } from './lib/money'
import type { Tx } from './lib/types'

// Code-split the heaviest on-demand screens so they don't weigh down first paint.
const Reports = lazy(() => import('./screens/Reports').then((m) => ({ default: m.Reports })))
const Chat = lazy(() => import('./screens/Chat').then((m) => ({ default: m.Chat })))

function Screens() {
  const route = useRoute()
  switch (route) {
    case '/':
      return <Dashboard />
    case '/ledger':
      return <Ledger />
    case '/reports':
      return <Reports />
    case '/more':
      return <More />
    case '/funds':
      return <Funds />
    case '/held':
      return <Held />
    case '/debts':
      return <Debts />
    case '/budgets':
      return <Budgets />
    case '/settings':
      return <Settings />
    case '/settings/accounts':
      return <ManageAccounts />
    case '/settings/categories':
      return <ManageCategories />
    case '/settings/sources':
      return <ManageSources />
    case '/settings/people':
      return <ManagePeople />
    case '/settings/notifications':
      return <NotifSettings />
    case '/settings/currency':
      return <Currency />
    case '/settings/templates':
      return <Templates />
    default:
      if (route.startsWith('/held/'))
        return <HeldHistory personId={decodeURIComponent(route.slice('/held/'.length))} />
      if (route.startsWith('/debts/'))
        return <DebtHistory personId={decodeURIComponent(route.slice('/debts/'.length))} />
      return <Dashboard />
  }
}

// Fires threshold alerts the instant a transaction or budget change crosses a
// limit, deduped per day/month via settings.firedKeys.
function AlertWatcher() {
  const { data, dispatch } = useStore()
  const toast = useToast()
  const prev = useRef({ txs: data.transactions, budgets: data.budgets })

  useEffect(() => {
    const changed = prev.current.txs !== data.transactions || prev.current.budgets !== data.budgets
    prev.current = { txs: data.transactions, budgets: data.budgets }
    if (!changed) return
    const events = newAlerts(data)
    if (!events.length) return
    for (const e of events) {
      toast({ kind: e.kind, title: e.title, body: e.body })
      notifyAlert(data, e)
    }
    dispatch({ type: 'alerts/fired', keys: events.map((e) => e.key) })
  }, [data, toast, dispatch])

  return null
}

// Minute-tick reminder scheduler + service-worker notification-click routing.
function ReminderScheduler() {
  const { data, dispatch } = useStore()
  const toast = useToast()
  const ref = useRef(data)
  ref.current = data

  useEffect(
    () =>
      startReminderScheduler(
        () => ref.current,
        (keys) => dispatch({ type: 'alerts/fired', keys }),
        (title, body) => toast({ kind: 'ok', title, body }),
      ),
    [dispatch, toast],
  )

  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return
    const on = (e: MessageEvent) => {
      if (e.data?.type === 'navigate') location.hash = e.data.route
    }
    sw.addEventListener('message', on)
    return () => sw.removeEventListener('message', on)
  }, [])

  return null
}

// Auto-posts recurring templates due this month — idempotent via each template's lastPosted.
function RecurringPoster() {
  const { data, addTx, updateTemplate } = useStore()
  const ref = useRef(data)
  ref.current = data
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current) return
    didRun.current = true
    const today = todayStr()
    const day = Number(today.slice(8, 10))
    const month = today.slice(0, 7)
    for (const t of ref.current.templates) {
      if (!t.repeatDay || t.lastPosted === month || day < t.repeatDay) continue
      const p = t.preset
      if (!p.type || !p.amount || !p.accountId) continue
      addTx({ ...p, date: today } as Omit<Tx, 'id' | 'createdAt'>)
      updateTemplate({ ...t, lastPosted: month })
    }
  }, [addTx, updateTemplate])

  return null
}

function Shell() {
  const [sheet, setSheet] = useState<SheetOpts | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const open = useCallback((opts: SheetOpts) => setSheet(opts), [])
  return (
    <SheetCtx.Provider value={open}>
      <AlertWatcher />
      <ReminderScheduler />
      <RecurringPoster />
      <div className="app">
        <Suspense fallback={<div className="screen" />}>
          <Screens />
        </Suspense>
        <TabBar onAdd={() => open({})} />
      </div>
      {!chatOpen && (
        <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open assistant chat">
          <Icon name="chat" size={24} />
        </button>
      )}
      {chatOpen && (
        <div className="chat-pop">
          <Suspense fallback={null}>
            <Chat onClose={() => setChatOpen(false)} />
          </Suspense>
        </div>
      )}
      {sheet && <AddSheet opts={sheet} onClose={() => setSheet(null)} />}
    </SheetCtx.Provider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <SyncProvider>
          <Shell />
        </SyncProvider>
      </ToastProvider>
    </StoreProvider>
  )
}
