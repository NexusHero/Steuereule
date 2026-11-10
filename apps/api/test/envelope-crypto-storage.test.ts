import { describe, expect, it } from 'vitest'
import { EnvelopeCryptoService } from '../src/receipt/storage/envelope-crypto.service.js'
import {
  MAX_RECEIPT_FILE_BYTES,
  detectAllowedReceiptMimeType,
} from '../src/receipt/storage/magic-bytes.js'
import { InMemoryStorageAdapter } from './fakes/in-memory-storage.adapter.js'

const PDF_HEADER = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj', 'utf8')
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const WEBP_BYTES = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1')

describe('detectAllowedReceiptMimeType', () => {
  it('detects authentic PDF, JPEG, PNG, and WebP magic bytes', () => {
    expect(detectAllowedReceiptMimeType(PDF_HEADER)).toBe('application/pdf')
    expect(detectAllowedReceiptMimeType(JPEG_BYTES)).toBe('image/jpeg')
    expect(detectAllowedReceiptMimeType(PNG_BYTES)).toBe('image/png')
    expect(detectAllowedReceiptMimeType(WEBP_BYTES)).toBe('image/webp')
  })

  it('rejects empty, oversized, HTML, SVG, ZIP/EXE, and spoofed files', () => {
    expect(() => detectAllowedReceiptMimeType(Buffer.alloc(0))).toThrow(/leer/)
    expect(() => detectAllowedReceiptMimeType(Buffer.alloc(MAX_RECEIPT_FILE_BYTES + 1, 0x25))).toThrow(/10 MB/)
    expect(() => detectAllowedReceiptMimeType(Buffer.from('<html><script>alert(1)</script></html>'))).toThrow(
      /Unzulässiges Dateiformat/,
    )
    expect(() => detectAllowedReceiptMimeType(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow(
      /Unzulässiges Dateiformat/,
    )
    expect(() => detectAllowedReceiptMimeType(Buffer.from('MZ\x90\x00fake.exe'))).toThrow(
      /Unzulässiges Dateiformat/,
    )
  })
})

describe('EnvelopeCryptoService & StoragePort', () => {
  it('encrypts with per-user DEK + AES-256-GCM AAD, prevents plaintext persistence, and binds AAD to userId:receiptId', () => {
    const crypto = new EnvelopeCryptoService()
    const wrappedDek = crypto.generateWrappedDek('user-a', 1)
    const secretContent = Buffer.from('%PDF-1.7 SECRET_STEUER_DOC', 'utf8')

    const encrypted = crypto.encryptForUser({
      userId: 'user-a',
      receiptId: 'rec-1',
      wrappedDek,
      keyVersion: 1,
      plainBytes: secretContent,
    })

    expect(encrypted.cipherBytes.toString('utf8')).not.toContain('SECRET_STEUER_DOC')

    const decrypted = crypto.decryptForUser({
      userId: 'user-a',
      receiptId: 'rec-1',
      wrappedDek,
      keyVersion: 1,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      cipherBytes: encrypted.cipherBytes,
    })
    expect(decrypted.equals(secretContent)).toBe(true)

    // Wrong receiptId AAD fails authentication tag verification
    expect(() =>
      crypto.decryptForUser({
        userId: 'user-a',
        receiptId: 'rec-2',
        wrappedDek,
        keyVersion: 1,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        cipherBytes: encrypted.cipherBytes,
      }),
    ).toThrow()

    // Tampered ciphertext fails authentication tag verification
    const tampered = Buffer.from(encrypted.cipherBytes)
    tampered[0] = tampered[0]! ^ 0xff
    expect(() =>
      crypto.decryptForUser({
        userId: 'user-a',
        receiptId: 'rec-1',
        wrappedDek,
        keyVersion: 1,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        cipherBytes: tampered,
      }),
    ).toThrow()
  })

  it('supports KEK key rotation via PRISMA_FIELD_DECRYPTION_KEYS fallback', () => {
    const oldMaster = 'k1.aesgcm256.OLDKEY1234567890123456789012345678'
    const newMaster = 'k2.aesgcm256.NEWKEY1234567890123456789012345678'

    const writer = new EnvelopeCryptoService(() => ({ encryptionKey: oldMaster, decryptionKeys: [] }))
    const wrappedDek = writer.generateWrappedDek('user-rot', 1)
    const blob = writer.encryptForUser({
      userId: 'user-rot',
      receiptId: 'rec-rot',
      wrappedDek,
      keyVersion: 1,
      plainBytes: PDF_HEADER,
    })

    const rotatedReader = new EnvelopeCryptoService(() => ({
      encryptionKey: newMaster,
      decryptionKeys: [oldMaster],
    }))
    const recovered = rotatedReader.decryptForUser({
      userId: 'user-rot',
      receiptId: 'rec-rot',
      wrappedDek,
      keyVersion: 1,
      iv: blob.iv,
      authTag: blob.authTag,
      cipherBytes: blob.cipherBytes,
    })
    expect(recovered.equals(PDF_HEADER)).toBe(true)
  })

  it('crypto-shredding: deleting user DEK renders ciphertext unrecoverable (ADR-0021)', async () => {
    const storage = new InMemoryStorageAdapter()
    await storage.put({
      userId: 'user-shred',
      receiptId: 'rec-shred',
      buffer: PDF_HEADER,
      mimeType: 'application/pdf',
    })

    // Raw blob exists and can be retrieved before erasure
    const before = await storage.get('user-shred', 'rec-shred')
    expect(before?.buffer.equals(PDF_HEADER)).toBe(true)

    const raw = storage.rawEntryForTest('user-shred', 'rec-shred')
    expect(raw).not.toBeNull()
    expect(raw!.cipherBytes.toString('utf8')).not.toContain('%PDF-1.7')

    // Shred user's DEK (simulating deleteAccountTransaction deleting UserEncryptionKey)
    storage.cryptoShredUser('user-shred')

    // Ciphertext blob is STILL present in raw storage, yet unrecoverable
    expect(storage.rawEntryForTest('user-shred', 'rec-shred')).not.toBeNull()
    expect(await storage.get('user-shred', 'rec-shred')).toBeNull()
  })
})
