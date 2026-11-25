// Real-Postgres proof (ADR-0004) for P7: what account deletion, the legal holds and the guest takeover do with the
// rows the personal-data registry names. Runs in CI's integration tier against migrated tax-data and keystore
// databases. Only this file's own ids are touched.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { ACCOUNT_DELETION_REPOSITORY, type AccountDeletionRepository } from '../src/account/account-deletion.repository.js'
import { sweepEndedLegalHolds } from '../src/account/lifecycle-sweeps.prisma.js'
import { personIds, shadowIdOf } from '../src/account/personal-data-registry.js'
import { upgradeGuestToAccount } from '../src/auth/guest-account-upgrade.prisma.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../src/prisma/encrypted-prisma.provider.js'
import { PostgresByteaStorageAdapter } from '../src/receipt/storage/postgres-bytea-storage.adapter.js'
import { SUBMISSION_REPOSITORY, type SubmissionRepository } from '../src/submission/submission.repository.js'
import { UNLOCK_REPOSITORY, type UnlockRepository } from '../src/unlock/unlock.repository.js'
import { asDatabaseUser, asFixture, fixtureClient } from './support/database-fixture.js'

const YEAR = 2025
const YEARS = 365 * 24 * 60 * 60 * 1000

describe('account lifecycle — real Postgres (P7)', () => {
  let app: NestFastifyApplication
  /** The app's own client, handed to the system paths under test as the server hands it. */
  let appPrisma: EncryptedPrismaClient
  /** The suite's seeding, cleanup and assertions (`test-fixture`). */
  let prisma: EncryptedPrismaClient
  let deletion: AccountDeletionRepository
  let unlocks: UnlockRepository
  let submissions: SubmissionRepository
  let files: PostgresByteaStorageAdapter
  const ids: string[] = []

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    appPrisma = app.get(ENCRYPTED_PRISMA)
    prisma = fixtureClient(appPrisma)
    deletion = app.get(ACCOUNT_DELETION_REPOSITORY)
    unlocks = app.get(UNLOCK_REPOSITORY)
    submissions = app.get(SUBMISSION_REPOSITORY)
    files = app.get(PostgresByteaStorageAdapter, { strict: false })
  })

  /** What the user's own checkout and unlock requests do, as that user. */
  const checkoutOf = (userId: string) => asDatabaseUser(userId, unlocks)
  /** What the payment webhook does, as a system path (`payment-webhook` in the service that calls it). */
  const webhook = () => fixtureClient(unlocks)
  /** Receipt files as their owner reaches them. */
  const filesOf = (userId: string) => asDatabaseUser(userId, files)

  afterEach(async () => {
    for (const id of ids.splice(0)) {
      const where = { userId: { in: personIds(id) } }
      await prisma.legalHold.deleteMany({ where })
      await prisma.unlock.deleteMany({ where })
      await prisma.filingVersion.deleteMany({ where })
      await prisma.receiptFile.deleteMany({ where })
      await prisma.receipt.deleteMany({ where })
      await prisma.lstb.deleteMany({ where })
      await prisma.profile.deleteMany({ where })
      await prisma.interviewAnswer.deleteMany({ where })
      await prisma.taxYear.deleteMany({ where })
      await prisma.taxDataAccessLog.deleteMany({ where })
      await prisma.taxYearLink.deleteMany({ where: { OR: [{ personAUserId: id }, { personBUserId: id }] } })
      await prisma.partnerLink.deleteMany({ where: { OR: [{ personAUserId: id }, { personBUserId: id }] } })
      await prisma.householdPerson.deleteMany({ where: { householdUserId: id } })
      await prisma.user.deleteMany({ where: { id } })
    }
  })

  afterAll(async () => {
    await app.close()
  })

  async function newAccount(): Promise<string> {
    const id = `lifecycle-${randomUUID()}`
    ids.push(id)
    await prisma.user.create({ data: { id, name: 'Lebenszyklus', email: `${id}@example.com`, emailVerified: true } })
    return id
  }

  function newGuest(): string {
    const id = randomUUID()
    ids.push(id)
    return id
  }

  it('API-2: deleting A deletes what A kept for Person B under the shadow id, also after a switch to a single return', async () => {
    const a = await newAccount()
    const shadow = shadowIdOf(a, YEAR)
    await prisma.taxYearLink.create({ data: { personAUserId: a, personBUserId: '', taxYear: YEAR, filingType: 'einzel' } })
    await prisma.profile.create({ data: { userId: shadow, firstName: 'Berta', lastName: 'Beispiel', steuerId: null, steuernummer: null } })
    await prisma.lstb.create({ data: { userId: shadow, taxYear: YEAR } })

    await deletion.deleteAccount(a)

    expect(await prisma.profile.count({ where: { userId: shadow } })).toBe(0)
    expect(await prisma.lstb.count({ where: { userId: shadow } })).toBe(0)
    expect(await prisma.taxYearLink.count({ where: { personAUserId: a } })).toBe(0)
  })

  it('API-22/API-23: B deleting her own account keeps A\'s coupling and partner link, and erases B\'s facts in A\'s household', async () => {
    const a = await newAccount()
    const b = await newAccount()
    await prisma.taxYearLink.create({ data: { personAUserId: a, personBUserId: b, taxYear: YEAR, filingType: 'zusammen' } })
    await prisma.partnerLink.create({ data: { personAUserId: a, personBUserId: b, validFromYear: YEAR } })
    const copy = await prisma.householdPerson.create({ data: { householdUserId: a, kind: 'spouse', sealed: 'x', linkedUserId: b, updatedByUserId: a } })
    const child = await prisma.householdPerson.create({ data: { householdUserId: a, kind: 'child', sealed: 'y', updatedByUserId: a } })

    await deletion.deleteAccount(b)

    const link = await prisma.taxYearLink.findUnique({ where: { personAUserId_taxYear: { personAUserId: a, taxYear: YEAR } } })
    expect(link).toMatchObject({ filingType: 'zusammen', personBUserId: shadowIdOf(a, YEAR) })
    expect(await prisma.partnerLink.findUnique({ where: { personAUserId: a } })).toMatchObject({ personBUserId: '' })
    expect(await prisma.householdPerson.findUnique({ where: { id: copy.id } })).toBeNull()
    expect(await prisma.householdPerson.findUnique({ where: { id: child.id } })).not.toBeNull()
  })

  it('a refund that arrives before the completion event keeps the year locked, and the payment still gets its hold', async () => {
    const a = await newAccount()
    await checkoutOf(a).createOpenOnes(a, YEAR, `cs_${a}`)
    await webhook().revoke(`cs_${a}`, { kind: 'erstattet' })
    await webhook().markPaid(`cs_${a}`, 2_900, new Date('2026-03-01T10:00:00Z'))
    // The same for a session whose local row was never written: the refund rebuilds it from the owner.
    await webhook().revoke(`cs_lost_${a}`, { kind: 'erstattet' }, { userId: a, taxYear: YEAR, tier: 'standard' })
    await webhook().markPaid(`cs_lost_${a}`, 2_900, new Date('2026-03-01T10:00:00Z'), { userId: a, taxYear: YEAR, tier: 'standard' })

    expect(await checkoutOf(a).isPaid(a, YEAR)).toBe(false)
    const rows = await prisma.unlock.findMany({ where: { userId: a } })
    expect(rows.map((row) => row.status)).toEqual(['erstattet', 'erstattet'])
    expect(await prisma.legalHold.count({ where: { userId: a, resource: 'unlock' } })).toBe(2)
  })

  it('a redelivered "dispute opened" after a won dispute leaves the year unlocked', async () => {
    const a = await newAccount()
    await checkoutOf(a).createOpenOnes(a, YEAR, `cs_${a}`)
    await webhook().markPaid(`cs_${a}`, 2_900, new Date('2026-03-01T10:00:00Z'))
    await webhook().revoke(`cs_${a}`, { kind: 'angefochten', disputeId: 'dp_1' })
    expect(await checkoutOf(a).isPaid(a, YEAR)).toBe(false)
    await webhook().restore(`cs_${a}`, 'dp_1')
    await webhook().revoke(`cs_${a}`, { kind: 'angefochten', disputeId: 'dp_1' })
    expect(await checkoutOf(a).isPaid(a, YEAR)).toBe(true)
    // A second, distinct dispute of the same payment locks the year again.
    await webhook().revoke(`cs_${a}`, { kind: 'angefochten', disputeId: 'dp_2' })
    expect(await checkoutOf(a).isPaid(a, YEAR)).toBe(false)
  })

  it('API-24: a paid unlock and a submitted version outlive the deletion until their hold ends, then the sweep deletes them', async () => {
    const a = await newAccount()
    await checkoutOf(a).createOpenOnes(a, YEAR, `cs_${a}`)
    await webhook().markPaid(`cs_${a}`, 2_900, new Date('2026-03-01T10:00:00Z'))
    await checkoutOf(a).createOpenOnes(a, YEAR, `cs_open_${a}`)
    await prisma.taxYear.create({ data: { userId: a, taxYear: YEAR, baseEstimate: 0, openItems: 0 } })
    await asDatabaseUser(a, submissions).record({ userId: a, taxYear: YEAR, filingType: 'einzel', submittedOn: '2026-03-14', positions: { bruttoarbeitslohnA: 40_000 }, estimateAtSubmission: null })

    const result = await deletion.deleteAccount(a)

    expect(result.legalHolds).toEqual([
      { resource: 'filingVersion', count: 1, until: '2031-01-01T00:00:00.000Z', reason: '§ 169, § 170 AO' },
      { resource: 'unlock', count: 1, until: '2035-01-01T00:00:00.000Z', reason: '§ 147 AO, § 257 HGB' },
    ])
    expect(result.retainedUnderLegalHold).toBe(2)
    expect(await prisma.user.count({ where: { id: a } })).toBe(0)
    expect((await prisma.unlock.findMany({ where: { userId: a } })).map((u) => u.status)).toEqual(['bezahlt'])
    expect(await prisma.filingVersion.count({ where: { userId: a } })).toBe(1)
    expect(await prisma.taxYear.count({ where: { userId: a } })).toBe(0)

    // Five years on: the version's hold has ended, the payment's has not.
    await asFixture(() => sweepEndedLegalHolds(appPrisma as never, (id, at) => deletion.deleteAccount(id, at), new Date(Date.now() + 5 * YEARS + YEARS)))
    expect(await prisma.filingVersion.count({ where: { userId: a } })).toBe(0)
    expect(await prisma.unlock.count({ where: { userId: a } })).toBe(1)
    // Ten years on: nothing is left.
    await asFixture(() => sweepEndedLegalHolds(appPrisma as never, (id, at) => deletion.deleteAccount(id, at), new Date(Date.now() + 10 * YEARS + YEARS)))
    expect(await prisma.unlock.count({ where: { userId: a } })).toBe(0)
    expect(await prisma.legalHold.count({ where: { userId: a } })).toBe(0)
  })

  it('API-20: the takeover moves the guest\'s receipts with their files, readable under the account', async () => {
    const guest = newGuest()
    const account = await newAccount()
    const receipt = await prisma.receipt.create({ data: { userId: guest, fileName: 'quittung.pdf' } })
    await filesOf(guest).put({ userId: guest, receiptId: receipt.id, buffer: Buffer.from('%PDF-1.4 beleg'), mimeType: 'application/pdf' })
    await prisma.profile.create({ data: { userId: guest, firstName: 'Gast', lastName: 'Beispiel', steuerId: null, steuernummer: null } })

    await upgradeGuestToAccount(appPrisma as never, guest, account, files)

    expect(await prisma.receipt.findUnique({ where: { id: receipt.id } })).toMatchObject({ userId: account })
    const stored = await filesOf(account).get(account, receipt.id)
    expect(stored?.buffer.toString()).toBe('%PDF-1.4 beleg')
    expect(await filesOf(guest).get(guest, receipt.id)).toBeNull()
    expect(await prisma.profile.count({ where: { userId: account } })).toBe(1)
  })

  it('API-20: a receipt whose file cannot be stored for the account stays with the guest, row and file, and a second run moves it', async () => {
    const guest = newGuest()
    const account = await newAccount()
    const receipt = await prisma.receipt.create({ data: { userId: guest, fileName: 'quittung.pdf' } })
    await filesOf(guest).put({ userId: guest, receiptId: receipt.id, buffer: Buffer.from('%PDF-1.4 beleg'), mimeType: 'application/pdf' })

    const failing = { move: async () => Promise.reject(new Error('keystore unavailable')) }
    await expect(upgradeGuestToAccount(appPrisma as never, guest, account, failing)).resolves.toEqual({ complete: false, receiptsLeftBehind: [receipt.id] })
    expect(await prisma.receipt.findUnique({ where: { id: receipt.id } })).toMatchObject({ userId: guest })
    expect((await filesOf(guest).get(guest, receipt.id))?.buffer.toString()).toBe('%PDF-1.4 beleg')

    await expect(upgradeGuestToAccount(appPrisma as never, guest, account, files)).resolves.toMatchObject({ complete: true })
    expect(await prisma.receipt.findUnique({ where: { id: receipt.id } })).toMatchObject({ userId: account })
    expect((await filesOf(account).get(account, receipt.id))?.buffer.toString()).toBe('%PDF-1.4 beleg')
  })

  it('API-20: a file written for the account is rolled back when the receipt row cannot move', async () => {
    const guest = newGuest()
    const account = await newAccount()
    const receipt = await prisma.receipt.create({ data: { userId: guest, fileName: 'quittung.pdf' } })
    await filesOf(guest).put({ userId: guest, receiptId: receipt.id, buffer: Buffer.from('%PDF-1.4 beleg'), mimeType: 'application/pdf' })

    // The real file move, then a failure before the row moves: the transaction takes the file back.
    const thenFails = { move: async (from: string, to: string, id: string) => (await files.move(from, to, id), Promise.reject(new Error('interrupted'))) }
    await expect(upgradeGuestToAccount(appPrisma as never, guest, account, thenFails)).resolves.toMatchObject({ complete: false })
    expect((await filesOf(guest).get(guest, receipt.id))?.buffer.toString()).toBe('%PDF-1.4 beleg')
    expect(await filesOf(account).get(account, receipt.id)).toBeNull()
  })

  it('API-20: what the guest recorded for Person B moves to the account\'s shadow id of the year', async () => {
    const guest = newGuest()
    const account = await newAccount()
    await prisma.taxYear.create({ data: { userId: guest, taxYear: YEAR, baseEstimate: 0, openItems: 0 } })
    await prisma.taxYearLink.create({ data: { personAUserId: guest, taxYear: YEAR, filingType: 'zusammen', personBUserId: shadowIdOf(guest, YEAR) } })
    await prisma.profile.create({ data: { userId: shadowIdOf(guest, YEAR), firstName: 'Person', lastName: 'B', steuerId: null, steuernummer: null } })

    await upgradeGuestToAccount(appPrisma as never, guest, account, files)

    expect(await prisma.taxYearLink.findUnique({ where: { personAUserId_taxYear: { personAUserId: account, taxYear: YEAR } } })).toMatchObject({ personBUserId: shadowIdOf(account, YEAR) })
    expect(await prisma.profile.findUnique({ where: { userId: shadowIdOf(account, YEAR) } })).toMatchObject({ lastName: 'B' })
    expect(await prisma.profile.count({ where: { userId: shadowIdOf(guest, YEAR) } })).toBe(0)
  })
})
