// ADR-0109: plaintext identity rows -> ciphertext + e-mail hash, against a real Postgres.
import { PrismaClient } from '@prisma/client'
import { schemaFieldEncryption } from '../src/prisma/field-encryption.js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { backfillIdentity } from '../src/auth/identity-backfill.prisma.js'
import { publishEmailHashSalt, resolveFieldEncryptionKey } from '../src/prisma/field-encryption-key.js'
import { createDatabaseAdapter } from '../src/common/database-adapter.js'

const CIPHERTEXT = /^v1\.aesgcm256\./

let plain: PrismaClient
let encrypted: PrismaClient

interface RawUser { email: string; name: string; emailHash: string | null; updatedAt: Date }
async function rawUser(id: string): Promise<RawUser> {
  const rows = await plain.$queryRaw<RawUser[]>`SELECT "email", "name", "emailHash", "updatedAt" FROM "User" WHERE "id" = ${id}`
  return rows[0]!
}

/** A row as the release before ADR-0109 wrote it: plain columns, no hash. */
async function insertPlainUser(id: string, email: string, name: string): Promise<void> {
  await plain.$executeRaw`INSERT INTO "User" ("id", "email", "name", "updatedAt") VALUES (${id}, ${email}, ${name}, now())`
}

describe('identity backfill (ADR-0109)', () => {
  beforeAll(() => {
    const { encryptionKey, decryptionKeys } = resolveFieldEncryptionKey()
    publishEmailHashSalt()
    plain = new PrismaClient({ adapter: createDatabaseAdapter() })
    encrypted = plain.$extends(schemaFieldEncryption({ encryptionKey, decryptionKeys })) as unknown as PrismaClient
  })
  afterEach(async () => {
    await plain.session.deleteMany()
    await plain.user.deleteMany()
  })
  afterAll(async () => {
    await plain.$disconnect()
  })

  it('reads plaintext rows as they are, and finds them by e-mail once the hash is filled (the window before encryption)', async () => {
    await insertPlainUser('u-window', 'Window.User@Example.com', 'Anna Beispiel')
    expect((await encrypted.user.findUnique({ where: { id: 'u-window' } }))?.name).toBe('Anna Beispiel')

    await backfillIdentity(plain, encrypted, 'hash')

    const raw = await rawUser('u-window')
    expect(raw.email).toBe('Window.User@Example.com')
    expect(raw.emailHash).toMatch(/^[0-9a-f]{64}$/)
    // better-auth lowercases before it asks; the hash normalises the same way.
    expect((await encrypted.user.findFirst({ where: { email: 'window.user@example.com' } }))?.id).toBe('u-window')
  })

  it('turns plaintext into ciphertext, reads it back as plaintext, and a second run changes nothing', async () => {
    await insertPlainUser('u-one', 'one@example.com', 'Eins Beispiel')
    await plain.$executeRaw`INSERT INTO "Session" ("id","token","expiresAt","updatedAt","userId","ipAddress","userAgent")
      VALUES ('s-one','tok-one', now() + interval '1 day', now(), 'u-one', '203.0.113.7', 'Mozilla/5.0 Test')`
    const before = await rawUser('u-one')

    const first = await backfillIdentity(plain, encrypted)
    expect(first).toEqual({ usersConverted: 1, sessionsConverted: 1, skipped: 0 })

    const raw = await rawUser('u-one')
    expect(raw.email).toMatch(CIPHERTEXT)
    expect(raw.name).toMatch(CIPHERTEXT)
    expect(raw.emailHash).not.toBeNull()
    expect(raw.updatedAt).toEqual(before.updatedAt)
    const rawSession = (await plain.$queryRaw<{ ipAddress: string; userAgent: string }[]>`SELECT "ipAddress","userAgent" FROM "Session" WHERE "id" = 's-one'`)[0]!
    expect(rawSession.ipAddress).toMatch(CIPHERTEXT)
    expect(rawSession.userAgent).toMatch(CIPHERTEXT)

    const user = await encrypted.user.findFirst({ where: { email: 'ONE@example.com'.toLowerCase() } })
    expect(user).toMatchObject({ id: 'u-one', email: 'one@example.com', name: 'Eins Beispiel' })
    expect(await encrypted.session.findUnique({ where: { id: 's-one' } })).toMatchObject({ ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 Test' })

    const second = await backfillIdentity(plain, encrypted)
    expect(second).toEqual({ usersConverted: 0, sessionsConverted: 0, skipped: 0 })
    expect(await rawUser('u-one')).toEqual(raw)
  })

  it('finishes a half-migrated table: converted, hash-only and plaintext rows side by side', async () => {
    await insertPlainUser('u-plain', 'plain@example.com', 'Plain')
    await insertPlainUser('u-hashed', 'hashed@example.com', 'Hashed')
    await backfillIdentity(plain, encrypted, 'hash')
    await insertPlainUser('u-late', 'late@example.com', 'Late')
    // One row already converted by the app itself (a write after the release).
    await encrypted.user.create({ data: { id: 'u-new', email: 'new@example.com', name: 'New' } })
    const converted = await rawUser('u-new')

    // The app reads all four the same way, whatever state they are in.
    const names = (await encrypted.user.findMany({ orderBy: { id: 'asc' } })).map((u) => u.name)
    expect(names).toEqual(['Hashed', 'Late', 'New', 'Plain'])

    const result = await backfillIdentity(plain, encrypted)
    expect(result.usersConverted).toBe(3)
    expect(result.skipped).toBe(0)
    for (const id of ['u-plain', 'u-hashed', 'u-late']) {
      const raw = await rawUser(id)
      expect(raw.email).toMatch(CIPHERTEXT)
      expect(raw.emailHash).not.toBeNull()
    }
    expect(await rawUser('u-new')).toEqual(converted)
    expect((await encrypted.user.findFirst({ where: { email: 'late@example.com' } }))?.name).toBe('Late')
  })

  it('leaves two addresses that differ only in case for the next run instead of failing', async () => {
    await insertPlainUser('u-a', 'Same@Example.com', 'A')
    await insertPlainUser('u-b', 'same@example.com', 'B')

    const result = await backfillIdentity(plain, encrypted)

    expect(result.usersConverted).toBe(1)
    expect(result.skipped).toBe(1)
  })
})
