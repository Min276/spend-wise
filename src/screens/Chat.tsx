import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { assist, afterSaveLine, type Block } from '../lib/assistant'
import { Icon } from '../components/Icons'

interface Msg {
  id: number
  role: 'user' | 'bot'
  blocks: Block[]
  resolved?: Record<number, 'added' | 'deleted' | 'cancelled'>
}

const GREETING: Msg = {
  id: 0,
  role: 'bot',
  blocks: [
    {
      kind: 'text',
      text: "Hi! I'm your Spendwise assistant — everything I do stays on this device.\n\nTell me things like “add 500 food”, “50 coffee, 120 grab”, “$20 netflix”, “lent 1000 to mg mg” — or ask “spending this month?”. I'll always ask before saving anything.",
    },
  ],
}

const QUICK: { label: string; text: string; insert?: boolean }[] = [
  { label: '+ add…', text: 'add ', insert: true },
  { label: 'balance', text: 'balance' },
  { label: 'budget left', text: 'budget left' },
  { label: 'report', text: 'report this month' },
  { label: 'owe', text: 'who do i owe' },
  { label: 'records', text: 'show records this month' },
  { label: 'undo', text: 'undo last' },
  { label: 'help', text: 'help' },
]

// survives open/close and tab switches; resets on reload
let session: Msg[] | null = null
let seq = 1

function StatsBlock({ b }: { b: Extract<Block, { kind: 'stats' }> }) {
  return (
    <div className="chat-stats">
      {b.title && <span className="label">{b.title}</span>}
      {b.items.map((it, i) => (
        <div className="spread" key={i}>
          <span className="small sub">{it.label}</span>
          <span className={`money bold small ${it.cls ?? ''}`}>{it.value}</span>
        </div>
      ))}
    </div>
  )
}

function TableBlock({ b }: { b: Extract<Block, { kind: 'table' }> }) {
  return (
    <div className="col-sm" style={{ gap: 6 }}>
      {b.title && <span className="label">{b.title}</span>}
      <div style={{ overflowX: 'auto' }}>
        <table className="chat-table">
          <thead>
            <tr>
              {b.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={j >= r.length - 1 ? 'money num' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.footer && <span className="xs muted">{b.footer}</span>}
    </div>
  )
}

export function Chat({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const [msgs, setMsgs] = useState<Msg[]>(() => session ?? [GREETING])
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    session = msgs
  }, [msgs])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs])

  const send = (raw: string) => {
    const textIn = raw.trim()
    if (!textIn) return
    const reply = assist(store.data, textIn)
    setMsgs((m) => [
      ...m,
      { id: seq++, role: 'user', blocks: [{ kind: 'text', text: textIn }] },
      { id: seq++, role: 'bot', blocks: reply },
    ])
    setInput('')
    inputRef.current?.focus()
  }

  const quick = (q: (typeof QUICK)[number]) => {
    if (q.insert) {
      setInput(q.text)
      inputRef.current?.focus()
    } else send(q.text)
  }

  const resolveConfirm = (msgId: number, blockIdx: number, action: 'added' | 'deleted' | 'cancelled') => {
    const msg = msgs.find((m) => m.id === msgId)
    const block = msg?.blocks[blockIdx]
    if (!msg || !block || (block.kind !== 'confirm' && block.kind !== 'delete') || msg.resolved?.[blockIdx]) return
    let followUp = 'Cancelled — nothing was changed.'
    if (action === 'added' && block.kind === 'confirm') {
      let tx = block.tx
      if (block.newParty) {
        const personId = store.addEntity('heldParties', { name: block.newParty })
        tx = { ...tx, personId }
      }
      followUp = afterSaveLine(store.data, tx)
      store.addTx(tx)
    } else if (action === 'deleted' && block.kind === 'delete') {
      store.deleteTx(block.txId)
      followUp = 'Deleted ✓'
    }
    setMsgs((m) => [
      ...m.map((x) => (x.id === msgId ? { ...x, resolved: { ...x.resolved, [blockIdx]: action } } : x)),
      { id: seq++, role: 'bot', blocks: [{ kind: 'text', text: followUp }] },
    ])
  }

  return (
    <div className="chat-root" role="dialog" aria-modal="true" aria-label="Assistant chat">
      <div className="spread" style={{ flex: 'none' }}>
        <span className="rowx" style={{ gap: 8, alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>Assistant</h2>
          <span className="xs muted">offline · private</span>
        </span>
        <button className="btn-icon" onClick={onClose} aria-label="Close chat">
          <Icon name="x" />
        </button>
      </div>

      <div className="chat-scroll">
        {msgs.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'bubble bubble-user' : 'bubble bubble-bot'}>
            {m.blocks.map((b, i) => {
              if (b.kind === 'text')
                return (
                  <p key={i} style={{ whiteSpace: 'pre-line' }}>
                    {b.text}
                  </p>
                )
              if (b.kind === 'stats') return <StatsBlock key={i} b={b} />
              if (b.kind === 'table') return <TableBlock key={i} b={b} />
              const state = m.resolved?.[i]
              const isDelete = b.kind === 'delete'
              return (
                <div key={i} className="col-sm" style={{ gap: 8 }}>
                  <p>{b.text}</p>
                  {state ? (
                    <span className="xs muted">
                      {state === 'added' ? '✓ Added' : state === 'deleted' ? '✓ Deleted' : '✕ Cancelled'}
                    </span>
                  ) : (
                    <div className="rowx" style={{ gap: 8 }}>
                      <button
                        className={isDelete ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary'}
                        onClick={() => resolveConfirm(m.id, i, isDelete ? 'deleted' : 'added')}
                      >
                        <Icon name={isDelete ? 'trash' : 'check'} size={14} /> {isDelete ? 'Delete it' : 'Add it'}
                      </button>
                      <button className="btn btn-sm" onClick={() => resolveConfirm(m.id, i, 'cancelled')}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chip-row chat-quick">
        {QUICK.map((q) => (
          <button key={q.label} className="chip" onClick={() => quick(q)}>
            {q.label}
          </button>
        ))}
      </div>

      <div className="chat-inputbar">
        <input
          ref={inputRef}
          className="input"
          placeholder="add 500 food · balance · help"
          value={input}
          autoFocus
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          aria-label="Message the assistant"
        />
        <button className="btn btn-primary" style={{ minWidth: 48, padding: 0 }} onClick={() => send(input)} aria-label="Send">
          <Icon name="send" size={19} />
        </button>
      </div>
    </div>
  )
}
