import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppData } from './types'
import { getSupabase, isConfigured } from './supabase'
import { isImportable, normalizeData, useStore } from './store'
import { createVault, openVault, seal, unseal, type Vault } from './crypto'
import { useToast } from '../components/Toasts'
import { Field } from '../components/ui'

// Cross-device sync of the single AppData blob, end-to-end encrypted: Supabase only
// ever holds ciphertext, and the AES key (derived from the unlock passphrase) lives
// only in memory here. Local-first is preserved — the store's localStorage cache is
// untouched; signing in + unlocking layers sync on top. The Supabase client itself is
// loaded lazily (getSupabase) so it never blocks first paint.
//
// ponytail: last-write-wins with an optimistic version guard, and other-device
// changes are pulled on window focus. Upgrade path: swap focus-polling for Supabase
// realtime, and add field-level merge instead of whole-blob replace.

const BACKUP_KEY = 'spendwise:v1:presync-backup'
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Status = 'idle' | 'syncing' | 'synced' | 'error'

interface SyncValue {
  configured: boolean
  session: Session | null
  email: string | null
  unlocked: boolean
  hasRemote: boolean | null
  status: Status
  error: string
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<{ needsConfirm: boolean }>
  signInGoogle(): Promise<void>
  signOut(): Promise<void>
  unlock(passphrase: string): Promise<void>
  lock(): void
}

const Ctx = createContext<SyncValue | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, dispatch } = useStore()
  const toast = useToast()
  const [session, setSession] = useState<Session | null>(null)
  const [vault, setVault] = useState<Vault | null>(null)
  const [hasRemote, setHasRemote] = useState<boolean | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const versionRef = useRef(0)
  const lastSyncedJson = useRef<string | null>(null)
  const dataRef = useRef<AppData>(data)
  dataRef.current = data
  const vaultRef = useRef<Vault | null>(vault)
  vaultRef.current = vault
  const sessionRef = useRef<Session | null>(session)
  sessionRef.current = session

  async function pull() {
    const sb = await getSupabase()
    const v = vaultRef.current
    const id = sessionRef.current?.user.id
    if (!sb || !v || !id) return
    try {
      const { data: row, error } = await sb.from('app_data').select('ciphertext, version').eq('user_id', id).maybeSingle()
      if (error) throw error
      if (!row || row.version <= versionRef.current) return
      const remote = await unseal(v, row.ciphertext)
      if (!isImportable(remote)) throw new Error('Synced data was unreadable.')
      const normalized = normalizeData(remote)
      versionRef.current = row.version
      lastSyncedJson.current = JSON.stringify(normalized)
      dispatch({ type: 'data/import', data: normalized })
      setStatus('synced')
    } catch (e) {
      setError(msg(e))
      setStatus('error')
    }
  }

  async function push(json: string, snapshot: AppData) {
    const sb = await getSupabase()
    const v = vaultRef.current
    const id = sessionRef.current?.user.id
    if (!sb || !v || !id) return
    try {
      setStatus('syncing')
      const ct = await seal(v, snapshot)
      const nextV = versionRef.current + 1
      const { data: rows, error } = await sb
        .from('app_data')
        .update({ ciphertext: ct, version: nextV, updated_at: new Date().toISOString() })
        .eq('user_id', id)
        .eq('version', versionRef.current)
        .select('version')
      if (error) throw error
      if (!rows || rows.length === 0) {
        // another device wrote a newer version — take theirs rather than clobber it
        await pull()
        return
      }
      versionRef.current = nextV
      lastSyncedJson.current = json
      setStatus('synced')
    } catch (e) {
      setError(msg(e))
      setStatus('error')
    }
  }

  // auth session lifecycle — loads the client lazily, then wires it up
  useEffect(() => {
    if (!isConfigured) return
    let active = true
    let unsub: (() => void) | undefined
    getSupabase().then((sb) => {
      if (!sb || !active) return
      sb.auth.getSession().then(({ data }) => active && setSession(data.session))
      const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
        setSession(s)
        if (!s) {
          setVault(null)
          setHasRemote(null)
          setStatus('idle')
          versionRef.current = 0
          lastSyncedJson.current = null
        }
      })
      unsub = () => sub.subscription.unsubscribe()
    })
    return () => {
      active = false
      unsub?.()
    }
  }, [])

  // once signed in but still locked, learn whether a remote row exists (create vs unlock)
  useEffect(() => {
    if (!isConfigured || !session || vault) return
    let active = true
    getSupabase().then(async (sb) => {
      if (!sb || !active) return
      const { data: row, error } = await sb.from('app_data').select('version').eq('user_id', session.user.id).maybeSingle()
      if (!active) return
      if (error) setError(error.message)
      else setHasRemote(!!row)
    })
    return () => {
      active = false
    }
  }, [session, vault])

  // push local changes (debounced) once unlocked
  useEffect(() => {
    if (!isConfigured || !session || !vault) return
    const json = JSON.stringify(data)
    if (json === lastSyncedJson.current) return
    const t = setTimeout(() => void push(json, data), 800)
    return () => clearTimeout(t)
  }, [data, session, vault])

  // pull other-device changes when the tab regains focus
  useEffect(() => {
    if (!isConfigured || !session || !vault) return
    const onFocus = () => void pull()
    addEventListener('focus', onFocus)
    return () => removeEventListener('focus', onFocus)
  }, [session, vault])

  async function unlock(passphrase: string) {
    const sb = await getSupabase()
    const s = session
    if (!sb || !s) return
    setError('')
    setStatus('syncing')
    try {
      const { data: row, error } = await sb.from('app_data').select('ciphertext, version').eq('user_id', s.user.id).maybeSingle()
      if (error) throw error
      if (row) {
        let opened: { vault: Vault; data: unknown }
        try {
          opened = await openVault(passphrase, row.ciphertext)
        } catch {
          throw new Error('BADPASS')
        }
        if (!isImportable(opened.data)) throw new Error('BADPASS')
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify(dataRef.current))
        } catch {
          /* pre-sync backup is best-effort */
        }
        const normalized = normalizeData(opened.data)
        versionRef.current = row.version
        lastSyncedJson.current = JSON.stringify(normalized)
        setVault(opened.vault)
        setHasRemote(true)
        setStatus('synced')
        dispatch({ type: 'data/import', data: normalized })
        toast({ kind: 'ok', title: 'Sync unlocked', body: 'Your data is decrypted on this device.' })
      } else {
        const v = await createVault(passphrase)
        const ct = await seal(v, dataRef.current)
        const { error: insErr } = await sb.from('app_data').insert({ user_id: s.user.id, ciphertext: ct, version: 1 })
        if (insErr) throw insErr
        versionRef.current = 1
        lastSyncedJson.current = JSON.stringify(dataRef.current)
        setVault(v)
        setHasRemote(true)
        setStatus('synced')
        toast({ kind: 'ok', title: 'Sync on', body: 'This device is now encrypted and backed up.' })
      }
    } catch (e) {
      setError(msg(e) === 'BADPASS' ? 'Wrong passphrase, or the data could not be read.' : msg(e))
      setStatus('error')
      throw e
    }
  }

  function lock() {
    setVault(null)
    setStatus('idle')
  }

  async function signIn(email: string, password: string) {
    setError('')
    const sb = await getSupabase()
    if (!sb) return
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      throw error
    }
  }
  async function signUp(email: string, password: string) {
    setError('')
    const sb = await getSupabase()
    if (!sb) return { needsConfirm: false }
    const { data, error } = await sb.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      throw error
    }
    return { needsConfirm: !data.session }
  }
  async function signInGoogle() {
    setError('')
    const sb = await getSupabase()
    if (!sb) return
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })
    if (error) {
      setError(error.message)
      throw error
    }
  }
  async function signOut() {
    const sb = await getSupabase()
    await sb?.auth.signOut()
    lock()
  }

  const value: SyncValue = {
    configured: isConfigured,
    session,
    email: session?.user.email ?? null,
    unlocked: !!vault,
    hasRemote,
    status,
    error,
    signIn,
    signUp,
    signInGoogle,
    signOut,
    unlock,
    lock,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSync(): SyncValue {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSync outside SyncProvider')
  return c
}

export function SyncPanel() {
  const sync = useSync()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')

  if (!sync.configured) return <p className="muted">Cloud sync isn’t configured on this build.</p>

  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true)
    setInfo('')
    try {
      await fn()
    } catch {
      /* sync.error already carries the message */
    } finally {
      setBusy(false)
    }
  }

  if (!sync.session) {
    return (
      <div className="col-sm">
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button
          className="btn btn-primary btn-full"
          disabled={busy || !email || !password}
          onClick={run(async () => {
            if (mode === 'signup') {
              const { needsConfirm } = await sync.signUp(email, password)
              if (needsConfirm) setInfo('Check your email to confirm, then sign in.')
            } else {
              await sync.signIn(email, password)
            }
          })}
        >
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <button className="btn btn-outline btn-full" disabled={busy} onClick={run(() => sync.signInGoogle())}>
          Continue with Google
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
          {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}
        </button>
        {info && <p className="muted">{info}</p>}
        {sync.error && <p className="banner over">{sync.error}</p>}
      </div>
    )
  }

  if (!sync.unlocked) {
    if (sync.hasRemote === null) return <p className="muted">Checking your account…</p>
    const first = sync.hasRemote === false
    return (
      <div className="col-sm">
        <p className="sub">Signed in as {sync.email}</p>
        <Field label={first ? 'Create an unlock passphrase' : 'Unlock passphrase'}>
          <input className="input" type="password" autoComplete="off" value={p1} onChange={(e) => setP1(e.target.value)} />
        </Field>
        {first && (
          <Field label="Confirm passphrase">
            <input className="input" type="password" autoComplete="off" value={p2} onChange={(e) => setP2(e.target.value)} />
          </Field>
        )}
        <button className="btn btn-primary btn-full" disabled={busy || !p1 || (first && p1 !== p2)} onClick={run(() => sync.unlock(p1))}>
          {first ? 'Turn on encrypted sync' : 'Unlock'}
        </button>
        {first && (
          <p className="muted">
            This passphrase encrypts your data end-to-end. It’s never sent to the server and can’t be recovered — if you lose it,
            the synced data can’t be read.
          </p>
        )}
        <button className="btn btn-ghost btn-sm" onClick={run(() => sync.signOut())}>
          Sign out
        </button>
        {sync.error && <p className="banner over">{sync.error}</p>}
      </div>
    )
  }

  const label = sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Sync error' : 'Encrypted & synced'
  return (
    <div className="col-sm">
      <p className="sub">
        {label} · {sync.email}
      </p>
      <div className="grid2">
        <button className="btn btn-outline" onClick={() => sync.lock()}>
          Lock
        </button>
        <button className="btn btn-ghost" onClick={run(() => sync.signOut())}>
          Sign out
        </button>
      </div>
      {sync.error && <p className="banner over">{sync.error}</p>}
    </div>
  )
}
