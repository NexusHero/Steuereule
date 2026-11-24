// ADR-0107 H3 rollout backfill (Codex review P1): non-strict field encryption only encrypts on the
// next write, so pre-deployment Profile rows keep their name in cleartext until re-saved. This proves
// the one-time backfill re-encrypts such rows and is idempotent on already-encrypted ones. Real
// Postgres (DATABASE_URL + migrations), like the other *.integration.test.ts.
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { backfillProfileNameEncryption } from '../scripts/backfill-profile-name-encryption.js'
import { resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'

const ENVELOPE = /^v\d+\.aesgcm256\./

describe('backfill: profile name encryption (ADR-0107 H3)', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient()
  })
  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "Profile" WHERE "userId" LIKE 'backfill-test-%'`)
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function insertPlaintextProfile(userId: string, firstName: string, lastName: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Profile" ("id","userId","firstName","lastName","createdAt","updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, now(), now())`,
      userId,
      firstName,
      lastName,
    )
  }

  async function rawName(userId: string): Promise<{ firstName: string; lastName: string }> {
    const [row] = await prisma.$queryRawUnsafe<{ firstName: string; lastName: string }[]>(
      `SELECT "firstName","lastName" FROM "Profile" WHERE "userId" = $1`,
      userId,
    )
    return row!
  }

  it('re-encrypts a cleartext name row and leaves the plaintext readable through the client', async () => {
    await insertPlaintextProfile('backfill-test-cleartext', 'Hans', 'Klartext')

    const before = await rawName('backfill-test-cleartext')
    expect(before.firstName).toBe('Hans') // cleartext at rest, pre-backfill

    const result = await backfillProfileNameEncryption(new PrismaClient())
    expect(result.reEncrypted).toBeGreaterThanOrEqual(1)

    const after = await rawName('backfill-test-cleartext')
    expect(after.firstName).toMatch(ENVELOPE)
    expect(after.lastName).toMatch(ENVELOPE)

    // Read-back through the encrypted client returns the original plaintext: the backfill encrypted the
    // name it found, under the key the application reads with.
    const encrypted = prisma.$extends(fieldEncryptionExtension(resolveFieldEncryptionKey(process.env)))
    const profile = await encrypted.profile.findFirst({ where: { userId: 'backfill-test-cleartext' } })
    expect(profile).toMatchObject({ firstName: 'Hans', lastName: 'Klartext' })
  })

  it('is idempotent: a second run leaves an already-encrypted row exactly as it is', async () => {
    await insertPlaintextProfile('backfill-test-idem', 'Erika', 'Doppelt')
    await backfillProfileNameEncryption(new PrismaClient())
    const first = await rawName('backfill-test-idem')
    expect(first.firstName).toMatch(ENVELOPE)

    await backfillProfileNameEncryption(new PrismaClient())

    // Every encryption draws a fresh IV, so a row written again would hold a different ciphertext. The same
    // bytes after the second run prove the row was skipped — whatever other rows the shared database holds.
    expect(await rawName('backfill-test-idem')).toEqual(first)
  })

  it('finishes a half-migrated row: one name already encrypted, the other still in cleartext', async () => {
    await insertPlaintextProfile('backfill-test-half', 'Greta', 'Halb')
    const encrypted = prisma.$extends(fieldEncryptionExtension(resolveFieldEncryptionKey(process.env)))
    await encrypted.profile.update({ where: { userId: 'backfill-test-half' }, data: { firstName: 'Greta' } })
    await prisma.$executeRawUnsafe(`UPDATE "Profile" SET "lastName" = 'Halb' WHERE "userId" = 'backfill-test-half'`)
    const before = await rawName('backfill-test-half')
    expect(before.firstName).toMatch(ENVELOPE)
    expect(before.lastName).toBe('Halb')

    await backfillProfileNameEncryption(new PrismaClient())

    const after = await rawName('backfill-test-half')
    expect(after.firstName).toMatch(ENVELOPE)
    expect(after.lastName).toMatch(ENVELOPE)
    expect(await encrypted.profile.findFirst({ where: { userId: 'backfill-test-half' } })).toMatchObject({
      firstName: 'Greta',
      lastName: 'Halb',
    })
  })
})
