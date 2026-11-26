import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { FieldEncryptionKeySet } from '../../common/field-encryption-keys.js'

const INFO = 'advisor-run-log'
const VERSION = 'v1.'
const IV_BYTES = 12
const TAG_BYTES = 16

/** A 256-bit key for the run log, derived from a field-encryption key so the log needs no secret of its own. */
function derive(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), INFO, 32))
}

/**
 * Seals the events of an owl run for the shared Redis run log (H2-9): AES-256-GCM under a key derived
 * (HKDF-SHA256) from the field-encryption key, with the position of the entry as associated data, so an
 * entry neither reads in clear nor opens at another place. Sealed with the current key; the rotated-out
 * keys still open what was written before a rotation (the stream lives minutes, not longer).
 */
export class RunEventCipher {
  private readonly keys: readonly Buffer[]

  constructor(keys: FieldEncryptionKeySet) {
    this.keys = [keys.encryptionKey, ...keys.decryptionKeys].map(derive)
  }

  seal(plaintext: string, associatedData: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.keys[0]!, iv)
    cipher.setAAD(Buffer.from(associatedData, 'utf8'))
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return VERSION + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  }

  /** The plaintext, or null when the entry was not sealed here, was changed, or belongs elsewhere. */
  open(sealed: string, associatedData: string): string | null {
    if (!sealed.startsWith(VERSION)) return null
    const raw = Buffer.from(sealed.slice(VERSION.length), 'base64')
    if (raw.length < IV_BYTES + TAG_BYTES) return null
    const iv = raw.subarray(0, IV_BYTES)
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const body = raw.subarray(IV_BYTES + TAG_BYTES)
    for (const key of this.keys) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAAD(Buffer.from(associatedData, 'utf8'))
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
      } catch {
        // Not this key, or not intact: try the next one.
      }
    }
    return null
  }
}
