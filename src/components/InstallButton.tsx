import { useEffect, useState } from 'react'
import { Sheet } from './ui'
import { Icon } from './Icons'

// The install experience differs by platform:
//  • Chromium (Android / desktop Chrome, Edge): a `beforeinstallprompt` event we can
//    fire on demand for a native install.
//  • iOS Safari: no such event — the user must use Share → Add to Home Screen, so we
//    show those steps instead.
// The button hides itself entirely once the app is already installed (standalone).

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const w = () => window as unknown as { __installPrompt?: InstallPromptEvent | null; navigator: Navigator }
const getStored = (): InstallPromptEvent | null => w().__installPrompt ?? null
const clearStored = () => {
  w().__installPrompt = null
}

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS reports as Mac

export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(getStored)
  const [installed, setInstalled] = useState(isStandalone())
  const [showIos, setShowIos] = useState(false)

  useEffect(() => {
    const onReady = () => setPrompt(getStored())
    const onInstalled = () => {
      setInstalled(true)
      clearStored()
      setPrompt(null)
    }
    addEventListener('installready', onReady)
    addEventListener('appinstalled', onInstalled)
    return () => {
      removeEventListener('installready', onReady)
      removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null
  const ios = isIOS()
  if (!prompt && !ios) return null // nothing installable to offer on this browser

  const onClick = async () => {
    if (prompt) {
      await prompt.prompt()
      try {
        await prompt.userChoice
      } catch {
        /* user dismissed */
      }
      clearStored()
      setPrompt(null)
    } else {
      setShowIos(true)
    }
  }

  return (
    <div className="col-sm">
      <button className="btn btn-primary btn-full" onClick={onClick}>
        <Icon name="download" size={18} /> Install Spendwise
      </button>
      {showIos && (
        <Sheet title="Add Spendwise to your Home Screen" onClose={() => setShowIos(false)}>
          <p className="sub">Install it as a full-screen, offline app — no App Store needed:</p>
          <ol className="col-sm" style={{ paddingInlineStart: 20, margin: 0, lineHeight: 1.55 }}>
            <li>
              Tap the <b>Share</b> button (a square with an arrow pointing up) in Safari’s toolbar — bottom on iPhone, top
              on iPad.
            </li>
            <li>
              Scroll down and tap <b>Add to Home Screen</b>.
            </li>
            <li>
              Tap <b>Add</b> in the top-right corner.
            </li>
          </ol>
        </Sheet>
      )}
    </div>
  )
}
