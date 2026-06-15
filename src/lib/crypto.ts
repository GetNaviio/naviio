import crypto from 'crypto'

/**
 * Application-layer secret encryption (SEC-POL-001 §3.1). OAuth access/refresh
 * tokens are encrypted with AES-256-GCM before persistence, so a database dump
 * or read-replica leak never exposes usable provider tokens — defense in depth
 * on top of RDS at-rest (AES-256) encryption.
 *
 * Format:  encv1:<iv_b64>.<authTag_b64>.<ciphertext_b64>
 * The version prefix lets us rotate algorithms later, and lets `decryptSecret`
 * transparently pass through LEGACY PLAINTEXT values (no prefix) so existing
 * rows keep working and are re-encrypted on their next write.
 *
 * Key: `TOKEN_ENCRYPTION_KEY` — a 32-byte key, hex (64 chars) or base64.
 * Generate one with:  openssl rand -base64 32
 * If unset (local dev), values are stored as-is; production MUST set it.
 */

const ALGO = 'aes-256-gcm'
const PREFIX = 'encv1:'

function getKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) return null
  let key: Buffer
  try {
    key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  } catch {
    return null
  }
  return key.length === 32 ? key : null
}

/** True once the value is in our encrypted envelope format. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}

/**
 * Encrypt a secret. Returns the `encv1:` envelope. If no key is configured
 * (local dev), returns the plaintext unchanged so the app still works; the
 * value carries no prefix and `decryptSecret` will pass it through.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext
  const key = getKey()
  if (!key) {
    // Fail closed in production — never store provider tokens unencrypted there.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TOKEN_ENCRYPTION_KEY must be set in production to store provider tokens')
    }
    return plaintext
  }
  if (isEncrypted(plaintext)) return plaintext // already encrypted — don't double-wrap
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

/**
 * Decrypt a secret. Plaintext (no prefix) is returned unchanged for backward
 * compatibility. An encrypted value with no/invalid key throws — failing loudly
 * is correct: a misconfigured key must not silently yield a broken token.
 */
export function decryptSecret(value: string): string {
  if (!value || !isEncrypted(value)) return value
  const key = getKey()
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required to decrypt stored secrets')
  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split('.')
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted secret')
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()])
  return pt.toString('utf8')
}
