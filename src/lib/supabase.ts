import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Whether sync is available — checked synchronously without loading the ~130KB client.
export const isConfigured = !!(url && key)

let clientPromise: Promise<SupabaseClient | null> | null = null

// Loads @supabase/supabase-js on first use (dynamic import → its own lazy chunk), so it
// never weighs down first paint for people who don't turn on sync. Memoized thereafter.
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isConfigured) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } }),
    )
  }
  return clientPromise
}
