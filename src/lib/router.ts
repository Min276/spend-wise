import { useEffect, useState } from 'react'

const current = () => location.hash.replace(/^#/, '') || '/'

export function useRoute(): string {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const on = () => setRoute(current())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

export function navigate(to: string) {
  location.hash = to
}
