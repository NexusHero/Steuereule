import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { resolveKeystoreMasterKeys, type KeystoreMasterKeys } from '../../keystore/keystore-config.js'

export const KEYSTORE_MASTER_KEYS_PROVIDER = Symbol('KEYSTORE_MASTER_KEYS_PROVIDER')

const DEK_LENGTH_BYTES = 32
const GCM_IV_LENGTH_BYTES = 12
const KEK_SALT = Buffer.from('steuereule-beleg-kek-v1', 'utf8')

export interface EncryptedBlob {
  readonly iv: Buffer
  readonly authTag: Buffer
  readonly cipherBytes: Buffer
  /** HMAC-SHA256 of the plaintext under a key derived from the user's DEK — not a plain hash. */
  readonly contentMac: string
}

/**
 * Per-user DEK + KEK envelope cryptography for uploaded original receipts (ADR-0008 / Art. 17 DSGVO).
 *
 * - Each user gets an independent random 256-bit Data Encryption Key (DEK).
 * - Each DEK is wrapped via AES-256-GCM under a user-scoped KEK derived with HKDF-SHA256
 *   from KEYSTORE_MASTER_KEY (KEYSTORE_MASTER_KEY_PREVIOUS still unwraps during a rotation).
 * - The wrapped DEK lives in the separate keystore database (ADR-0059), never next to the files.
 * - Each receipt binary is encrypted with AES-256-GCM and authenticated with AAD `userId:receiptId`.
 * - Destroying the user's keystore row crypto-shreds all encrypted blobs of that user.
 */
@Injectable()
export class EnvelopeCryptoService {
  private readonly keysProvider: () => KeystoreMasterKeys

  constructor(
    @Optional() @Inject(KEYSTORE_MASTER_KEYS_PROVIDER) keysProvider?: () => KeystoreMasterKeys,
  ) {
    this.keysProvider = keysProvider ?? (() => resolveKeystoreMasterKeys())
  }

  private deriveKek(masterKey: Buffer, userId: string): Buffer {
    const raw = hkdfSync(
      'sha256',
      masterKey,
      KEK_SALT,
      Buffer.from(`user-dek:${userId}`, 'utf8'),
      DEK_LENGTH_BYTES,
    )
    return Buffer.from(raw)
  }

  generateWrappedDek(userId: string, keyVersion = 1): string {
    const dek = randomBytes(DEK_LENGTH_BYTES)
    const kek = this.deriveKek(this.keysProvider().current, userId)
    try {
      const iv = randomBytes(GCM_IV_LENGTH_BYTES)
      const cipher = createCipheriv('aes-256-gcm', kek, iv)
      cipher.setAAD(Buffer.from(`dek:${userId}:${keyVersion}`, 'utf8'))
      const wrapped = Buffer.concat([cipher.update(dek), cipher.final()])
      const tag = cipher.getAuthTag()
      return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${wrapped.toString('base64')}`
    } finally {
      dek.fill(0)
      kek.fill(0)
    }
  }

  private unwrapDek(userId: string, wrappedDek: string, keyVersion: number): Buffer {
    const parts = wrappedDek.split('.')
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Malformed wrapped DEK envelope format')
    }
    const iv = Buffer.from(parts[1]!, 'base64')
    const tag = Buffer.from(parts[2]!, 'base64')
    const ciphertext = Buffer.from(parts[3]!, 'base64')

    const { current, previous } = this.keysProvider()
    const candidateMasters = [current, ...previous]

    let lastError: unknown = null
    for (const master of candidateMasters) {
      const kek = this.deriveKek(master, userId)
      try {
        const decipher = createDecipheriv('aes-256-gcm', kek, iv)
        decipher.setAAD(Buffer.from(`dek:${userId}:${keyVersion}`, 'utf8'))
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(ciphertext), decipher.final()])
      } catch (err) {
        lastError = err
      } finally {
        kek.fill(0)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Failed to unwrap user DEK')
  }

  encryptForUser(input: {
    readonly userId: string
    readonly receiptId: string
    readonly wrappedDek: string
    readonly keyVersion: number
    readonly plainBytes: Buffer
  }): EncryptedBlob {
    const dek = this.unwrapDek(input.userId, input.wrappedDek, input.keyVersion)
    try {
      const iv = randomBytes(GCM_IV_LENGTH_BYTES)
      const cipher = createCipheriv('aes-256-gcm', dek, iv)
      cipher.setAAD(Buffer.from(`${input.userId}:${input.receiptId}`, 'utf8'))
      const cipherBytes = Buffer.concat([cipher.update(input.plainBytes), cipher.final()])
      const authTag = cipher.getAuthTag()
      const macKey = Buffer.from(hkdfSync('sha256', dek, KEK_SALT, 'content-mac', DEK_LENGTH_BYTES))
      const contentMac = createHmac('sha256', macKey).update(input.plainBytes).digest('hex')
      macKey.fill(0)
      return { iv, authTag, cipherBytes, contentMac }
    } finally {
      dek.fill(0)
    }
  }

  decryptForUser(input: {
    readonly userId: string
    readonly receiptId: string
    readonly wrappedDek: string
    readonly keyVersion: number
    readonly iv: Buffer | Uint8Array
    readonly authTag: Buffer | Uint8Array
    readonly cipherBytes: Buffer | Uint8Array
  }): Buffer {
    const dek = this.unwrapDek(input.userId, input.wrappedDek, input.keyVersion)
    try {
      const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(input.iv))
      decipher.setAAD(Buffer.from(`${input.userId}:${input.receiptId}`, 'utf8'))
      decipher.setAuthTag(Buffer.from(input.authTag))
      return Buffer.concat([decipher.update(Buffer.from(input.cipherBytes)), decipher.final()])
    } finally {
      dek.fill(0)
    }
  }
}
