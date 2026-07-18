import { useCallback, useEffect, useRef, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { SheetCtx } from './lib/sheet'
import { useRoute } from './lib/router'
import { newAlerts } from './lib/alerts'
import { notifyAlert, startReminderScheduler } from './lib/notify'
import { AddSheet, type SheetOpts } from './components/AddSheet'
import { TabBar } from './components/TabBar'
import { ToastProvider, useToast } from './components/Toasts'
import { Dashboard } from './screens/Dashboard'
import { Ledger } from './screens/Ledger'
import { More } from './screens/More'
import { Settings } from './screens/Settings'
import { ManageAccounts, ManageCategories, ManagePeople, ManageSources } from './screens/Manage'
import { Funds } from './screens/Funds'
import { Held, HeldHistory } from './screens/Held'
import { Budgets } from './screens/Budgets'
import { Reports } from './screens/Reports'
import { NotifSettings } from './screens/NotifSettings'
import { Chat } from './screens/Chat'

function Screens() {
  const route = useRoute()
  switch (route) {
    case '/':
      return <Dashboard />
    case '/ledger':
      return <Ledger />
    case '/chat':
      return <Chat />
    case '/reports':
      return <Reports />
    case '/more':
      return <More />
    case '/funds':
      return <Funds />
    case '/held':
      return <Held />
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
    default:
      if (route.startsWith('/held/'))
        return <HeldHistory personId={decodeURIComponent(route.slice('/held/'.length))} />
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

function Shell() {
  const [sheet, setSheet] = useState<SheetOpts | null>(null)
  const open = useCallback((opts: SheetOpts) => setSheet(opts), [])
  return (
    <SheetCtx.Provider value={open}>
      <AlertWatcher />
      <ReminderScheduler />
      <div className="app">
        <Screens />
        <TabBar onAdd={() => open({})} />
      </div>
      {sheet && <AddSheet opts={sheet} onClose={() => setSheet(null)} />}
    </SheetCtx.Provider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  )
}
