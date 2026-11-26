// Real-Postgres cascade (ADR-0004), run via `pnpm --filter @steuereule/api test:integration` against a
// migrated database. Proves what the fakes cannot: the Abgabe writes the FilingVersion encrypted at rest
// (ADR-0008), replaces it on a corrected return, flips TaxYear.status and logs the write, all in one
// transaction; the undo removes it again. Only this file's own user rows are touched.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import type { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { FILING_VERSION_REPOSITORY, type FilingVersionRepository } from '../src/assessment/filing-version.repository.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { SUBMISSION_REPOSITORY, type SubmissionRepository } from '../src/submission/submission.repository.js'
import { asDatabaseUser, fixtureClient } from './support/database-fixture.js'

const USER = 'submission-integration-user'
const YEAR = 2025

describe('PrismaSubmissionRepository — real Postgres (ADR-0098 §8)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaClient
  let submissions: SubmissionRepository
  let versions: FilingVersionRepository

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = fixtureClient(app.get(PrismaService))
    // As USER's requests reach them (P11).
    submissions = asDatabaseUser(USER, app.get(SUBMISSION_REPOSITORY))
    versions = asDatabaseUser(USER, app.get(FILING_VERSION_REPOSITORY))
  })

  afterEach(async () => {
    const where = { userId: USER }
    await prisma.filingVersion.deleteMany({ where })
    await prisma.taxYear.deleteMany({ where })
    await prisma.taxDataAccessLog.deleteMany({ where })
    await prisma.legalHold.deleteMany({ where })
  })

  afterAll(async () => {
    await app.close()
  })

  it('API-24: the submitted version in force carries the legal hold; the withdrawal takes it away', async () => {
    await prisma.taxYear.create({ data: { userId: USER, taxYear: YEAR, baseEstimate: 0, openItems: 0 } })
    const version = { userId: USER, taxYear: YEAR, filingType: 'einzel', submittedOn: '2026-03-14', positions: { bruttoarbeitslohnA: 48_200 }, estimateAtSubmission: null } as const
    await submissions.record(version)
    await submissions.record({ ...version, submittedOn: '2026-04-02' })
    const [current] = await prisma.filingVersion.findMany({ where: { userId: USER } })
    const holds = await prisma.legalHold.findMany({ where: { userId: USER } })
    expect(holds).toHaveLength(1)
    expect(holds[0]).toMatchObject({ resource: 'filingVersion', resourceId: current!.id, reason: '§ 169, § 170 AO' })
    expect(holds[0]!.holdUntil.toISOString()).toBe('2031-01-01T00:00:00.000Z')

    await submissions.withdraw(USER, YEAR)
    expect(await prisma.legalHold.count({ where: { userId: USER } })).toBe(0)
  })

  it('freezes the version encrypted, replaces it on a corrected return, and undoes it', async () => {
    await prisma.taxYear.create({ data: { userId: USER, taxYear: YEAR, baseEstimate: 0, openItems: 0 } })
    expect(await submissions.yearStatus(USER, YEAR)).toBe('entwurf')

    const first = await submissions.record({ userId: USER, taxYear: YEAR, filingType: 'einzel', submittedOn: '2026-03-14', positions: { bruttoarbeitslohnA: 48_200, erstattung: 904 }, estimateAtSubmission: { from: 829, to: 979 } })
    expect(first).toEqual({ replacedPrevious: false })
    expect(await submissions.yearStatus(USER, YEAR)).toBe('eingereicht')
    const raw = await prisma.$queryRawUnsafe<{ positionen: string }[]>(`SELECT "positionen" FROM "Fassung" WHERE "userId" = $1`, USER)
    expect(raw[0]!.positionen).not.toContain('48200')

    const second = await submissions.record({ userId: USER, taxYear: YEAR, filingType: 'einzel', submittedOn: '2026-04-02', positions: { bruttoarbeitslohnA: 48_200, erstattung: 950 }, estimateAtSubmission: null })
    expect(second).toEqual({ replacedPrevious: true })
    expect(await prisma.filingVersion.count({ where: { userId: USER } })).toBe(1)
    expect(await versions.findLatest(USER, YEAR)).toMatchObject({ number: 2, submittedOn: '2026-04-02', positions: { erstattung: 950 }, estimateAtSubmission: null })

    await submissions.withdraw(USER, YEAR)
    expect(await versions.findLatest(USER, YEAR)).toBeNull()
    expect(await submissions.yearStatus(USER, YEAR)).toBe('entwurf')
    expect(await prisma.taxDataAccessLog.count({ where: { userId: USER, action: 'WRITE', resource: 'abgabe' } })).toBe(3)
  })
})
