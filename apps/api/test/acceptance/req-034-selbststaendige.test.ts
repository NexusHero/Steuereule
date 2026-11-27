// REQ-034 — ADR-0101 (Selbstständige) and REQ-015 as amended — real Postgres, real HTTP against `buildApp()`.
// Proves what only the database can: the append-only trigger on entries, lines and the log (UPDATE and
// DELETE refused, the Festschreibung only forward), the erasure path that the trigger lets through,
// ciphertext at rest, the hash chain over the stored rows, the switch, and the self-employment tier.
//
// The cleanup removes only the rows of the accounts this file created (under the erasure grant), never
// anything else in the database it runs against.
import { generateKey, getMessageKeyFingerprint, parseKeySync } from '@47ng/cloak'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveFieldEncryptionKey } from '../../src/prisma/field-encryption-key.js'
import { prismaRotationStore, rotateFieldEncryption, rotationKeys } from '../../src/prisma/field-key-rotation.js'
import { baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'
import { createDatabaseAdapter } from '../../src/config/database-adapter.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
/** The table owner, as the migration job connects; the server's client runs as `steuereule_app` (P11). */
const owner = new PrismaClient({ adapter: createDatabaseAdapter() })
afterAll(() => owner.$disconnect())
const YEAR = 2025
const created: string[] = []

const sale = {
  date: '2025-03-01',
  documentNumber: 'RE-2025-001',
  text: 'Honorar Projekt A',
  lines: [
    { account: '1200', side: 'debit', amount: 119000 },
    { account: '8400', side: 'credit', amount: 119000, taxKey: 'ust19' },
  ],
}

describe('REQ-034 — Selbstständige (ADR-0101) against the real server and database', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'req-029-secret',
      BETTER_AUTH_SECRET: 'req-029-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39995',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
      PAYMENT_FAKE_PROVIDER: '1',
      SELBSTSTAENDIGE_ENABLED: 'true',
    },
    cleanup: async () => {
      if (created.length === 0) return
      const ids = created.splice(0)
      await prisma.$transaction(async (tx) => {
        // The only way past the book's append-only triggers: the database's own erasure grant for these owners.
        await tx.$executeRaw`SELECT app_rls.allow_erasure(${ids}::text[])`
        await tx.journalLine.deleteMany({ where: { userId: { in: ids } } })
        await tx.journalEntry.deleteMany({ where: { userId: { in: ids } } })
        await tx.ledgerLogRecord.deleteMany({ where: { userId: { in: ids } } })
        await tx.bankTransaction.deleteMany({ where: { userId: { in: ids } } })
        await tx.ledger.deleteMany({ where: { userId: { in: ids } } })
        await tx.businessProfile.deleteMany({ where: { userId: { in: ids } } })
        await tx.fixedAsset.deleteMany({ where: { userId: { in: ids } } })
        await tx.interviewAnswer.deleteMany({ where: { userId: { in: ids } } })
        await tx.taxYear.deleteMany({ where: { userId: { in: ids } } })
        await tx.taxDataAccessLog.deleteMany({ where: { userId: { in: ids } } })
        await tx.unlock.deleteMany({ where: { userId: { in: ids } } })
        await tx.session.deleteMany({ where: { userId: { in: ids } } })
        await tx.account.deleteMany({ where: { userId: { in: ids } } })
        await tx.user.deleteMany({ where: { id: { in: ids } } })
      })
    },
  })

  async function selfEmployed(email: string): Promise<{ cookie: string; userId: string }> {
    const account = await signUp(email)
    created.push(account.userId)
    const answer = (questionId: string, value: string) =>
      fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: account.cookie, origin: ALLOWED_ORIGIN },
        body: JSON.stringify({ questionId, value }),
      })
    expect((await answer('job', 'Selbstständig')).status).toBe(200)
    return account
  }

  const call = (cookie: string, method: string, path: string, body?: unknown) =>
    fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/selbststaendig${path}`, {
      method,
      headers: { cookie, origin: ALLOWED_ORIGIN, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  it('posts an entry with its VAT line, stores amounts and texts as ciphertext, and keeps the chain intact', async () => {
    const { cookie, userId } = await selfEmployed('req029-book@example.com')
    expect((await call(cookie, 'POST', '/buchungen', sale)).status).toBe(201)
    const book = (await (await call(cookie, 'GET', '/buch')).json()) as { integrity: { ok: boolean }; entries: { lines: unknown[] }[] }
    expect(book.integrity.ok).toBe(true)
    expect(book.entries[0]?.lines).toHaveLength(3)
    const rows = await prisma.$queryRaw<{ betrag: string }[]>`SELECT z."betrag" FROM "Buchungszeile" z WHERE z."userId" = ${userId}`
    expect(rows.map((r) => r.betrag)).not.toContain('119000')
    const texts = await prisma.$queryRaw<{ buchungstext: string }[]>`SELECT "buchungstext" FROM "Buchung" WHERE "userId" = ${userId}`
    expect(texts[0]?.buchungstext).not.toBe('Honorar Projekt A')
  })

  it('the database refuses UPDATE and DELETE of entries, lines and the log, and a lock moving back', async () => {
    const { cookie, userId } = await selfEmployed('req029-trigger@example.com')
    await call(cookie, 'POST', '/buchungen', sale)
    await expect(prisma.$executeRaw`UPDATE "Buchung" SET "datum" = '2025-03-02' WHERE "userId" = ${userId}`).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRaw`DELETE FROM "Buchungszeile" WHERE "userId" = ${userId}`).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRaw`UPDATE "Buchungsprotokoll" SET "hash" = 'x' WHERE "userId" = ${userId}`).rejects.toThrow(/append-only/)
    expect((await call(cookie, 'POST', '/festschreibung', { through: '2025-03-31' })).status).toBe(200)
    await expect(prisma.$executeRaw`UPDATE "Buch" SET "festgeschriebenBis" = '2025-01-31' WHERE "userId" = ${userId}`).rejects.toThrow(/only moves forward/)
    expect((await call(cookie, 'POST', '/buchungen', { ...sale, documentNumber: 'RE-2' })).status).toBe(400)
  })

  // Key rotation (ADR-0008, migration 20261204090000_field_key_rotation): the trigger lets the encrypted columns of
  // the book move to a new key under `steuereule.reencryption`, nothing else; the chain over the clear text holds.
  it('a key rotation re-encrypts entries, lines and the log; under the rotation flag nothing else may change', async () => {
    const { cookie, userId } = await selfEmployed('req029-rotation@example.com')
    expect((await call(cookie, 'POST', '/buchungen', sale)).status).toBe(201)
    const current = resolveFieldEncryptionKey(process.env).encryptionKey
    const next = generateKey()
    // The rotation runs as the migration login (the table owner), never as the API's runtime role.
    const store = prismaRotationStore(owner)
    const fingerprints = async () =>
      (
        await prisma.$queryRaw<{ v: string }[]>`
          SELECT "betrag" AS v FROM "Buchungszeile" WHERE "userId" = ${userId}
          UNION ALL SELECT "buchungstext" FROM "Buchung" WHERE "userId" = ${userId}
          UNION ALL SELECT "inhalt" FROM "Buchungsprotokoll" WHERE "userId" = ${userId}`
      ).map((row) => getMessageKeyFingerprint(row.v))

    const forward = await rotateFieldEncryption(store, rotationKeys({ encryptionKey: next, decryptionKeys: [current] }), { ownerIds: [userId] })
    expect(forward.every((count) => count.unknownKey === 0 && count.retired === 0)).toBe(true)
    expect(new Set(await fingerprints())).toEqual(new Set([parseKeySync(next).fingerprint]))

    const underFlag = (client: { $transaction: PrismaClient['$transaction'] }, statement: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true), set_config('steuereule.reencryption', 'on', true)`
        await statement(tx)
      })
    // Not even the owner may change a column that is not encrypted under the flag.
    await expect(underFlag(owner, (tx) => tx.$executeRaw`UPDATE "Buchung" SET "datum" = '2025-03-02' WHERE "userId" = ${userId}`)).rejects.toThrow(/append-only/)
    // The API's runtime role may not use the flag at all, not even for an encrypted column.
    await expect(underFlag(prisma as never, (tx) => tx.$executeRaw`UPDATE "Buchung" SET "buchungstext" = "buchungstext" WHERE "userId" = ${userId}`)).rejects.toThrow(/append-only/)

    // Back to the key the server runs with: the book reads as before and its chain verifies.
    await rotateFieldEncryption(store, rotationKeys({ encryptionKey: current, decryptionKeys: [next] }), { ownerIds: [userId] })
    expect(new Set(await fingerprints())).toEqual(new Set([parseKeySync(current).fingerprint]))
    const book = (await (await call(cookie, 'GET', '/buch')).json()) as { integrity: { ok: boolean }; entries: { text: string }[] }
    expect(book.integrity.ok).toBe(true)
    expect(book.entries[0]?.text).toBe('Honorar Projekt A')
  })

  it('account deletion removes the book despite the trigger (erasure grant), nothing of it survives', async () => {
    const { cookie, userId } = await selfEmployed('req029-delete@example.com')
    await call(cookie, 'POST', '/buchungen', sale)
    const response = await fetch(`${baseUrl}/v1/account`, { method: 'DELETE', headers: { cookie, origin: ALLOWED_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) })
    expect([200, 204]).toContain(response.status)
    const left = await prisma.$queryRaw<{ n: bigint }[]>`SELECT (SELECT count(*) FROM "Buchung" WHERE "userId" = ${userId}) + (SELECT count(*) FROM "Buchungszeile" WHERE "userId" = ${userId}) + (SELECT count(*) FROM "Buchungsprotokoll" WHERE "userId" = ${userId}) + (SELECT count(*) FROM "Buch" WHERE "userId" = ${userId}) AS n`
    expect(Number(left[0]?.n)).toBe(0)
  })

  it('the fill-in help is behind the self-employment tier; the fake provider sells it', async () => {
    const { cookie, userId } = await selfEmployed('req029-tier@example.com')
    await call(cookie, 'POST', '/buchungen', sale)
    expect((await call(cookie, 'GET', '/elster/anlage-euer')).status).toBe(402)
    expect((await call(cookie, 'POST', '/checkout')).status).toBe(201)
    const [open] = await prisma.unlock.findMany({ where: { userId } })
    expect(open?.tier).toBe('selbststaendig')
    const webhook = await fetch(`${baseUrl}/v1/zahlung/stripe/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'fake-payment-signature' },
      body: JSON.stringify({ sessionId: open!.stripeCheckoutSessionId }),
    })
    expect(webhook.status).toBe(200)
    const help = await call(cookie, 'GET', '/elster/anlage-euer')
    expect(help.status).toBe(200)
    const body = (await help.json()) as { status: string; lines: { id: string; value: unknown }[] }
    expect(body.status).toBe('published')
  })

  it('switch off: the path answers 403 and the interview stops at the Gewerbe-Gate again', async () => {
    const { cookie } = await selfEmployed('req029-off@example.com')
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    try {
      expect((await call(cookie, 'GET', '')).status).toBe(403)
      const state = (await (await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/interview`, { headers: { cookie } })).json()) as { nextStep: unknown }
      expect(state.nextStep).toEqual({ kind: 'gate', id: 'gewerbe' })
    } finally {
      process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    }
  })
})
