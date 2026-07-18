/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[]
}

const entries = self.__WB_MANIFEST

// Cache name derives from the build manifest, so every deploy gets a fresh
// cache and activate() drops the old one.
let hash = 0
for (const ch of JSON.stringify(entries)) hash = (hash * 31 + ch.charCodeAt(0)) | 0
const CACHE = `spendwise-${(hash >>> 0).toString(36)}`

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(entries.map((en) => en.url)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then((c) => c.match('index.html').then((hit) => hit ?? fetch(req))),
    )
    return
  }
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req).then((hit) => hit ?? fetch(req))),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const route: string = e.notification.data?.route ?? '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list[0]
      if (client) {
        client.focus()
        client.postMessage({ type: 'navigate', route })
      } else {
        return self.clients.openWindow(`/#${route}`)
      }
    }),
  )
})
