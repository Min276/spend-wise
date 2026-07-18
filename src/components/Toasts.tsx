import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icons'

export interface ToastInput {
  kind: 'warn' | 'over' | 'ok'
  title: string
  body?: string
}

interface Toast extends ToastInput {
  id: number
}

const ToastCtx = createContext<(t: ToastInput) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current
    setToasts((s) => [...s, { ...t, id }])
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 6500)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {toasts.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <button
              key={t.id}
              className={`toast ${t.kind}`}
              onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
            >
              <span className="toast-ic">
                <Icon name={t.kind === 'ok' ? 'check' : 'warn'} size={19} />
              </span>
              <span style={{ textAlign: 'left' }}>
                <b>{t.title}</b>
                {t.body && (
                  <>
                    <br />
                    <span className="sub">{t.body}</span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  )
}
