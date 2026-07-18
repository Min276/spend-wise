import { useRef, useState } from 'react'
import { useStore, isImportable, normalizeData } from '../lib/store'
import type { AppData } from '../lib/types'
import { todayStr } from '../lib/money'
import { navigate } from '../lib/router'
import { BackButton, ConfirmDialog, Seg } from '../components/ui'
import { Icon, type IconName } from '../components/Icons'

function NavRow({ icon, label, sub, to }: { icon: IconName; label: string; sub?: string; to: string }) {
  return (
    <button className="lrow" onClick={() => navigate(to)}>
      <span className="lrow-icon" style={{ background: 'var(--sunken)', color: 'var(--text-secondary)' }}>
        <Icon name={icon} size={19} />
      </span>
      <span className="lrow-main">
        <span className="t">{label}</span>
        {sub && <span className="s">{sub}</span>}
      </span>
      <Icon name="chevron" size={18} />
    </button>
  )
}

export function Settings() {
  const { data, dispatch, patchSettings } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<Partial<AppData> | null>(null)
  const [importError, setImportError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spendwise-backup-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onFile = async (file: File | undefined) => {
    setImportError('')
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!isImportable(parsed)) throw new Error('shape')
      setPendingImport(parsed)
    } catch {
      setImportError("That file doesn't look like a Spendwise backup.")
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="rowx">
          <BackButton to="/more" />
          <h1>Settings</h1>
        </span>
      </div>

      <div className="col-sm">
        <span className="label">Appearance</span>
        <div className="card col-sm">
          <Seg
            options={[
              { value: 'light', label: '☀️ Light' },
              { value: 'system', label: 'System' },
              { value: 'dark', label: '🌙 Dark' },
            ]}
            value={data.settings.theme}
            onChange={(theme) => patchSettings({ theme })}
          />
        </div>
      </div>

      <div className="col-sm">
        <span className="label">Manage</span>
        <div className="list">
          <NavRow icon="wallet" label="Accounts" sub={`${data.accounts.length} accounts`} to="/settings/accounts" />
          <NavRow
            icon="chart"
            label="Categories"
            sub={`${data.categories.length} categories`}
            to="/settings/categories"
          />
          <NavRow
            icon="download"
            label="Income sources"
            sub={`${data.incomeSources.length} sources`}
            to="/settings/sources"
          />
          <NavRow
            icon="users"
            label="People (held funds)"
            sub={`${data.heldParties.length} people`}
            to="/settings/people"
          />
          <NavRow icon="bell" label="Notifications & reminders" to="/settings/notifications" />
        </div>
      </div>

      <div className="col-sm">
        <span className="label">Data</span>
        <div className="list">
          <button className="lrow" onClick={exportJson}>
            <span className="lrow-icon" style={{ background: 'var(--sunken)', color: 'var(--text-secondary)' }}>
              <Icon name="download" size={19} />
            </span>
            <span className="lrow-main">
              <span className="t">Export backup (JSON)</span>
              <span className="s">{data.transactions.length} transactions</span>
            </span>
          </button>
          <button className="lrow" onClick={() => fileRef.current?.click()}>
            <span className="lrow-icon" style={{ background: 'var(--sunken)', color: 'var(--text-secondary)' }}>
              <Icon name="upload" size={19} />
            </span>
            <span className="lrow-main">
              <span className="t">Import backup</span>
              <span className="s">Replaces all current data</span>
            </span>
          </button>
          <button className="lrow" onClick={() => setConfirmReset(true)}>
            <span
              className="lrow-icon"
              style={{ background: 'color-mix(in srgb, var(--expense) 12%, var(--surface))', color: 'var(--expense)' }}
            >
              <Icon name="trash" size={19} />
            </span>
            <span className="lrow-main">
              <span className="t" style={{ color: 'var(--expense)' }}>
                Reset all data
              </span>
              <span className="s">Start fresh with the default setup</span>
            </span>
          </button>
        </div>
        {importError && <p className="banner over">{importError}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      <p className="muted" style={{ textAlign: 'center' }}>
        Spendwise · all data stays on this device
      </p>

      {pendingImport && (
        <ConfirmDialog
          title="Import this backup?"
          body={`It contains ${pendingImport.transactions?.length ?? 0} transactions and ${
            pendingImport.accounts?.length ?? 0
          } accounts. Your current data will be replaced.`}
          confirmLabel="Import"
          danger={false}
          onConfirm={() => dispatch({ type: 'data/import', data: normalizeData(pendingImport) })}
          onClose={() => setPendingImport(null)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset all data?"
          body="Every transaction, account, fund, and setting will be erased. Export a backup first if you might need it."
          confirmLabel="Reset everything"
          onConfirm={() => dispatch({ type: 'data/reset' })}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}
