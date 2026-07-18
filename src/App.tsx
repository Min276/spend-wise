import { useCallback, useState } from 'react'
import { StoreProvider } from './lib/store'
import { SheetCtx } from './lib/sheet'
import { useRoute } from './lib/router'
import { AddSheet, type SheetOpts } from './components/AddSheet'
import { TabBar } from './components/TabBar'
import { Dashboard } from './screens/Dashboard'
import { Ledger } from './screens/Ledger'
import { More } from './screens/More'
import { Settings } from './screens/Settings'
import { ManageAccounts, ManageCategories, ManagePeople, ManageSources } from './screens/Manage'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{title}</h1>
      </div>
      <div className="card sub">Coming soon.</div>
    </div>
  )
}

function Screens() {
  const route = useRoute()
  switch (route) {
    case '/':
      return <Dashboard />
    case '/ledger':
      return <Ledger />
    case '/reports':
      return <Placeholder title="Reports" />
    case '/more':
      return <More />
    case '/funds':
      return <Placeholder title="Savings Funds" />
    case '/held':
      return <Placeholder title="Held for Others" />
    case '/budgets':
      return <Placeholder title="Budgets & Limits" />
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
      return <Placeholder title="Notifications" />
    default:
      if (route.startsWith('/held/')) return <Placeholder title="Held history" />
      return <Dashboard />
  }
}

function Shell() {
  const [sheet, setSheet] = useState<SheetOpts | null>(null)
  const open = useCallback((opts: SheetOpts) => setSheet(opts), [])
  return (
    <SheetCtx.Provider value={open}>
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
      <Shell />
    </StoreProvider>
  )
}
