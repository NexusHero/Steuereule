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
    prisma = app.get(PrismaService)
    submissions = app.get(SUBMISSION_REPOSITORY)
    versions = app.get(FILING_VERSION_REPOSITORY)
  })

  afterEach(async () => {
    const where = { userId: USER }
    await prisma.filingVersion.deleteMany({ where })
    await prisma.taxYear.deleteMany({ where })
    await prisma.taxDataAccessLog.deleteMany({ where })
  })

  afterAll(async () => {
    await app.close()
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
