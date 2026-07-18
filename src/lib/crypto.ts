// End-to-end encryption for the synced data blob. The AES-256-GCM key is derived
// from a passphrase that never leaves the device; Supabase only ever stores the
// packed ciphertext produced here. The PBKDF2 salt is stable per user (kept in the
// packed blob) so the same passphrase always re-derives the same key; a fresh IV is
// generated on every seal, which AES-GCM requires.

const PBKDF2_ITERS = 210_000
const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export interface Vault {
  key: CryptoKey
  salt: string // base64, stable per user
}

interface Packed {
  v: 1
  salt: string
  iv: string
  ct: string
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// First-time setup: a brand-new random salt and its derived key.
export async function createVault(passphrase: string): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt)
  return { key, salt: b64(salt) }
}

// Open an existing packed blob. Throws if the passphrase is wrong (GCM auth-tag fail).
export async function openVault(passphrase: string, packed: string): Promise<{ vault: Vault; data: unknown }> {
  const { salt, iv, ct } = JSON.parse(packed) as Packed
  const key = await deriveKey(passphrase, unb64(salt))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct))
  return { vault: { key, salt }, data: JSON.parse(dec.decode(plain)) }
}

// Encrypt a value into a packed blob string using the vault's key + a fresh IV.
export async function seal(vault: Vault, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vault.key, enc.encode(JSON.stringify(value)))
  const packed: Packed = { v: 1, salt: vault.salt, iv: b64(iv), ct: b64(ct) }
  return JSON.stringify(packed)
}

// Decrypt a packed blob with an already-open vault — no passphrase needed, used for
// background refetches once the key is in memory.
export async function unseal(vault: Vault, packed: string): Promise<unknown> {
  const { iv, ct } = JSON.parse(packed) as Packed
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, vault.key, unb64(ct))
  return JSON.parse(dec.decode(plain))
}
