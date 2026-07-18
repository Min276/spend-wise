import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { assist, afterSaveLine, type Block } from '../lib/assistant'
import { Icon } from '../components/Icons'

interface Msg {
  id: number
  role: 'user' | 'bot'
  blocks: Block[]
  resolved?: Record<number, 'added' | 'cancelled'>
}

const GREETING: Msg = {
  id: 0,
  role: 'bot',
  blocks: [
    {
      kind: 'text',
      text: "Hi! I'm your Spendwise assistant — everything I do stays on this device.\n\nTell me things like “add 500 food” or ask “spending this month?”. I'll always ask before saving anything.",
    },
  ],
}

const SUGGESTIONS = ['add 100 food', 'add 30000 as salary', '5000 held for Aunt', 'balance', 'report this month', 'help']

// survives tab switches; resets on reload
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

export function Chat() {
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

  const resolveConfirm = (msgId: number, blockIdx: number, action: 'added' | 'cancelled') => {
    const msg = msgs.find((m) => m.id === msgId)
    const block = msg?.blocks[blockIdx]
    if (!msg || !block || block.kind !== 'confirm' || msg.resolved?.[blockIdx]) return
    let followUp = 'Cancelled — nothing was saved.'
    if (action === 'added') {
      followUp = afterSaveLine(store.data, block.tx)
      store.addTx(block.tx)
    }
    setMsgs((m) => [
      ...m.map((x) => (x.id === msgId ? { ...x, resolved: { ...x.resolved, [blockIdx]: action } } : x)),
      { id: seq++, role: 'bot', blocks: [{ kind: 'text', text: followUp }] },
    ])
  }

  const showSuggestions = msgs.length <= 1

  return (
    <div className="screen screen-chat">
      <div className="screen-head">
        <h1>Assistant</h1>
        <span className="xs muted">offline · private</span>
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
              return (
                <div key={i} className="col-sm" style={{ gap: 8 }}>
                  <p>{b.text}</p>
                  {state ? (
                    <span className="xs muted">{state === 'added' ? '✓ Added' : '✕ Cancelled'}</span>
                  ) : (
                    <div className="rowx" style={{ gap: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => resolveConfirm(m.id, i, 'added')}>
                        <Icon name="check" size={14} /> Add it
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

        {showSuggestions && (
          <div className="wrap" style={{ justifyContent: 'center', paddingTop: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-inputbar">
        <input
          ref={inputRef}
          className="input"
          placeholder="add 500 food · balance · help"
          value={input}
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
