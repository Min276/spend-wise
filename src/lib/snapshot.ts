// Where the page mirrors its plaintext AppData for the service worker (Cache
// API is the one storage both can reach; localStorage is page-only). Same
// device, same origin — the same exposure as the localStorage copy.
export const DATA_CACHE = 'spendwise-data'
export const DATA_URL = '/__data.json'

export async function writeSnapshot(json: string): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const c = await caches.open(DATA_CACHE)
    await c.put(DATA_URL, new Response(json, { headers: { 'content-type': 'application/json' } }))
  } catch {
    // no Cache API (private mode, quota) — push bodies fall back to the generic text
  }
}
