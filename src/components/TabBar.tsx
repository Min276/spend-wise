import { Icon, type IconName } from './Icons'
import { navigate, useRoute } from '../lib/router'

const MORE_ROUTES = ['/more', '/funds', '/held', '/budgets', '/settings']

const tabs: { to: string; icon: IconName; label: string }[] = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/ledger', icon: 'list', label: 'Ledger' },
  { to: '/reports', icon: 'chart', label: 'Reports' },
  { to: '/more', icon: 'more', label: 'More' },
]

function isActive(to: string, route: string) {
  if (to === '/') return route === '/'
  if (to === '/more') return MORE_ROUTES.some((p) => route === p || route.startsWith(p + '/'))
  return route === to || route.startsWith(to + '/')
}

export function TabBar({ onAdd }: { onAdd: () => void }) {
  const route = useRoute()
  const [home, ledger, reports, more] = tabs
  return (
    <nav className="tabbar">
      <div className="tabbar-brand" aria-hidden>
        Spend<span>wise</span>
      </div>
      <div className="tabbar-inner">
        {[home, ledger].map((t) => (
          <TabButton key={t.to} tab={t} on={isActive(t.to, route)} />
        ))}
        <button className="tab-add" onClick={onAdd} aria-label="Add transaction">
          <Icon name="plus" size={26} />
          <span className="tab-add-label">New entry</span>
        </button>
        {[reports, more].map((t) => (
          <TabButton key={t.to} tab={t} on={isActive(t.to, route)} />
        ))}
      </div>
    </nav>
  )
}

function TabButton({ tab, on }: { tab: (typeof tabs)[number]; on: boolean }) {
  return (
    <button className={on ? 'on' : ''} onClick={() => navigate(tab.to)} aria-current={on ? 'page' : undefined}>
      <Icon name={tab.icon} />
      <span>{tab.label}</span>
    </button>
  )
}
