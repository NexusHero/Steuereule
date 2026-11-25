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

const YEAR = 2025
const YEARS = 365 * 24 * 60 * 60 * 1000

describe('account lifecycle — real Postgres (P7)', () => {
  let app: NestFastifyApplication
  let prisma: EncryptedPrismaClient
  let deletion: AccountDeletionRepository
  let unlocks: UnlockRepository
  let submissions: SubmissionRepository
  let files: PostgresByteaStorageAdapter
  const ids: string[] = []

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(ENCRYPTED_PRISMA)
    deletion = app.get(ACCOUNT_DELETION_REPOSITORY)
    unlocks = app.get(UNLOCK_REPOSITORY)
    submissions = app.get(SUBMISSION_REPOSITORY)
    files = app.get(PostgresByteaStorageAdapter, { strict: false })
  })

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

  it('API-24: a paid unlock and a submitted version outlive the deletion until their hold ends, then the sweep deletes them', async () => {
    const a = await newAccount()
    await unlocks.createOpenOnes(a, YEAR, `cs_${a}`)
    await unlocks.markPaid(`cs_${a}`, 2_900, new Date('2026-03-01T10:00:00Z'))
    await unlocks.createOpenOnes(a, YEAR, `cs_open_${a}`)
    await prisma.taxYear.create({ data: { userId: a, taxYear: YEAR, baseEstimate: 0, openItems: 0 } })
    await submissions.record({ userId: a, taxYear: YEAR, filingType: 'einzel', submittedOn: '2026-03-14', positions: { bruttoarbeitslohnA: 40_000 }, estimateAtSubmission: null })

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
    await sweepEndedLegalHolds(prisma as never, (id) => deletion.deleteAccount(id), new Date(Date.now() + 5 * YEARS + YEARS))
    expect(await prisma.filingVersion.count({ where: { userId: a } })).toBe(0)
    expect(await prisma.unlock.count({ where: { userId: a } })).toBe(1)
    // Ten years on: nothing is left.
    await sweepEndedLegalHolds(prisma as never, (id) => deletion.deleteAccount(id), new Date(Date.now() + 10 * YEARS + YEARS))
    expect(await prisma.unlock.count({ where: { userId: a } })).toBe(0)
    expect(await prisma.legalHold.count({ where: { userId: a } })).toBe(0)
  })

  it('API-20: the takeover moves the guest\'s receipts with their files, readable under the account', async () => {
    const guest = newGuest()
    const account = await newAccount()
    const receipt = await prisma.receipt.create({ data: { userId: guest, fileName: 'quittung.pdf' } })
    await files.put({ userId: guest, receiptId: receipt.id, buffer: Buffer.from('%PDF-1.4 beleg'), mimeType: 'application/pdf' })
    await prisma.profile.create({ data: { userId: guest, firstName: 'Gast', lastName: 'Beispiel', steuerId: null, steuernummer: null } })

    await upgradeGuestToAccount(prisma as never, guest, account, files)

    expect(await prisma.receipt.findUnique({ where: { id: receipt.id } })).toMatchObject({ userId: account })
    const stored = await files.get(account, receipt.id)
    expect(stored?.buffer.toString()).toBe('%PDF-1.4 beleg')
    expect(await files.get(guest, receipt.id)).toBeNull()
    expect(await prisma.profile.count({ where: { userId: account } })).toBe(1)
  })
})
