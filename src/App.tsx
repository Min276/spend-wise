import { useState } from 'react'
import { useRoute } from './lib/router'
import { TabBar } from './components/TabBar'

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

export default function App() {
  const route = useRoute()
  const [, setAddOpen] = useState(false)

  let screen = <Placeholder title="Spendwise" />
  if (route === '/ledger') screen = <Placeholder title="Ledger" />
  else if (route === '/reports') screen = <Placeholder title="Reports" />
  else if (route.startsWith('/more')) screen = <Placeholder title="More" />

  return (
    <div className="app">
      {screen}
      <TabBar onAdd={() => setAddOpen(true)} />
    </div>
  )
}
