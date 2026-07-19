import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/app.css'

// Capture the install prompt early (it can fire before React mounts) so the
// InstallButton can trigger it later. Chromium only — iOS Safari never fires this.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as unknown as { __installPrompt?: Event }).__installPrompt = e
  window.dispatchEvent(new Event('installready'))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
