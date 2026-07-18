import assert from 'node:assert/strict'
import { createVault, openVault, seal, unseal } from '../src/lib/crypto.ts'

// Exercises the end-to-end encryption the way sync will: seal a blob, prove the
// plaintext isn't recoverable from the packed string, round-trip it back, and
// confirm a wrong passphrase fails loudly instead of returning garbage.

const main = async () => {
  const secret = { transactions: [{ id: 't1', amount: 1234.5 }], note: 'ñön-ascii ✓ 中文' }
  const PASS = 'correct horse battery staple'

  const vault = await createVault(PASS)
  const packed = await seal(vault, secret)
  assert.ok(!packed.includes('1234.5') && !packed.includes('transactions'), 'ciphertext must not leak plaintext')

  const { data, vault: reopened } = await openVault(PASS, packed)
  assert.deepEqual(data, secret, 'round-trips back to the original object')
  assert.equal(reopened.salt, vault.salt, 'reopening keeps the same salt so the key stays stable')

  const packed2 = await seal(vault, secret)
  assert.notEqual((JSON.parse(packed) as { iv: string }).iv, (JSON.parse(packed2) as { iv: string }).iv, 'each seal uses a fresh IV')

  assert.deepEqual(await unseal(vault, packed2), secret, 'unseal decrypts with an already-open vault (no passphrase)')

  await assert.rejects(openVault('wrong passphrase', packed), 'a wrong passphrase must throw, never return garbage')

  console.log('✓ crypto.check: E2EE round-trip, IV freshness, and wrong-passphrase rejection all pass')
}

main().catch((e) => {
  console.error('✗ crypto.check failed:', e)
  process.exit(1)
})
