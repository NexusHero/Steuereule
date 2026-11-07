// REQ-003 Cryptographic Key Rotation Gate (k1 -> k2) & Seeded Data Survival (ADR-0008).
//
// Proves against a real Postgres instance that:
//   1. Tax data encrypted under key `k1` carries `k1`'s cloak key fingerprint at rest.
//   2. When the server rotates to `PRISMA_FIELD_ENCRYPTION_KEY = k2` with
//      `PRISMA_FIELD_DECRYPTION_KEYS = k1`, all historical `k1` rows remain readable
//      without data loss or decryption errors.
//   3. Re-saving or updating a record under the rotated configuration re-encrypts the
//      row under `k2`'s fingerprint, after which `k1` is no longer needed to read it.
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveFieldEncryptionKey } from '../../src/prisma/field-encryption-key.js'

const KEY_K1 = 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const KEY_K2 = 'k1.aesgcm256.fedcba9876543210fedcba9876543210fedcba98765='

describe('REQ-003 — Cryptographic field-encryption key rotation (k1 -> k2) against real Postgres', () => {
  let rawPrisma: PrismaClient
  const testUserId = `user-key-rotation-${Date.now()}`

  beforeAll(async () => {
    rawPrisma = new PrismaClient()
    await rawPrisma.$connect()
  })

  afterAll(async () => {
    await rawPrisma.profile.deleteMany({ where: { userId: testUserId } })
    await rawPrisma.masterData.deleteMany({ where: { userId: testUserId } })
    await rawPrisma.lstb.deleteMany({ where: { userId: testUserId } })
    await rawPrisma.$disconnect()
  })

  it('decrypts k1 ciphertexts during rotation window (encryptionKey=k2, decryptionKeys=[k1]) and re-encrypts to k2 on write', async () => {
    // 1. Resolve keys via the production helper to verify env parsing
    const k1Config = resolveFieldEncryptionKey({
      NODE_ENV: 'production',
      PRISMA_FIELD_ENCRYPTION_KEY: KEY_K1,
    })
    expect(k1Config).toEqual({ encryptionKey: KEY_K1, decryptionKeys: [] })

    const rotatedConfig = resolveFieldEncryptionKey({
      NODE_ENV: 'production',
      PRISMA_FIELD_ENCRYPTION_KEY: KEY_K2,
      PRISMA_FIELD_DECRYPTION_KEYS: KEY_K1,
    })
    expect(rotatedConfig).toEqual({ encryptionKey: KEY_K2, decryptionKeys: [KEY_K1] })

    // 2. Write sensitive Profile & LStB rows under KEY_K1
    const clientK1 = rawPrisma.$extends(
      fieldEncryptionExtension({
        encryptionKey: k1Config.encryptionKey,
        decryptionKeys: k1Config.decryptionKeys,
      }),
    )

    await clientK1.profile.create({
      data: {
        userId: testUserId,
        firstName: 'Rotation',
        lastName: 'Test',
        steuerId: '02476291358',
        steuernummer: '18181508155',
      },
    })

    await clientK1.lstb.create({
      data: {
        userId: testUserId,
        taxYear: 2025,
        bruttoarbeitslohn: '72000',
        lohnsteuer: '14200',
        sozialversicherung: '12800',
      },
    })

    // Inspect raw ciphertext fingerprint written by K1
    const rawBefore = await rawPrisma.$queryRaw<{ steuerId: string }[]>`
      SELECT "steuerId" FROM "Profile" WHERE "userId" = ${testUserId}
    `
    const k1Ciphertext = rawBefore[0]?.steuerId
    expect(k1Ciphertext).toMatch(/^v1\.aesgcm256\./)
    const k1Fingerprint = k1Ciphertext!.split('.')[2]

    // 3. Instantiate rotated client (writes with K2, can still decrypt K1)
    const clientRotated = rawPrisma.$extends(
      fieldEncryptionExtension({
        encryptionKey: rotatedConfig.encryptionKey,
        decryptionKeys: rotatedConfig.decryptionKeys,
      }),
    )

    // Existing K1 data must decrypt seamlessly
    const readUnderRotation = await clientRotated.profile.findUnique({
      where: { userId: testUserId },
    })
    expect(readUnderRotation?.steuerId).toBe('02476291358')
    expect(readUnderRotation?.steuernummer).toBe('18181508155')

    const lstbUnderRotation = await clientRotated.lstb.findUnique({
      where: { userId_taxYear: { userId: testUserId, taxYear: 2025 } },
    })
    expect(lstbUnderRotation?.bruttoarbeitslohn).toBe('72000')

    // 4. Re-save Profile under rotated client -> migrates ciphertext to K2
    await clientRotated.profile.update({
      where: { userId: testUserId },
      data: {
        steuerId: '02476291358',
        steuernummer: '18181508155',
      },
    })

    const rawAfter = await rawPrisma.$queryRaw<{ steuerId: string }[]>`
      SELECT "steuerId" FROM "Profile" WHERE "userId" = ${testUserId}
    `
    const k2Ciphertext = rawAfter[0]?.steuerId
    expect(k2Ciphertext).toMatch(/^v1\.aesgcm256\./)
    const k2Fingerprint = k2Ciphertext!.split('.')[2]
    expect(k2Fingerprint).not.toBe(k1Fingerprint)

    // 5. Client with ONLY K2 (K1 retired) can read the re-encrypted Profile
    const clientK2Only = rawPrisma.$extends(
      fieldEncryptionExtension({
        encryptionKey: KEY_K2,
        decryptionKeys: [],
      }),
    )
    const readAfterRetiringK1 = await clientK2Only.profile.findUnique({
      where: { userId: testUserId },
    })
    expect(readAfterRetiringK1?.steuerId).toBe('02476291358')
    expect(readAfterRetiringK1?.steuernummer).toBe('18181508155')
  })
})
