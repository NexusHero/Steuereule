// Real-Postgres proof (ADR-0004) for the batch reads the Verlauf uses: Kapital and Rente of several
// years in one query, scoped to the user, decrypted like the single-year read.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../src/capital/capital.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../src/pension/pension.repository.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { asDatabaseUser, fixtureClient } from './support/database-fixture.js'

const USER = 'batch-reads-user'
const OTHER = 'batch-reads-other'

describe('Kapital and Rente batch reads — real Postgres', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let capital: CapitalRepository
  let pension: PensionRepository

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = fixtureClient(app.get(PrismaService))
    capital = app.get<CapitalRepository>(CAPITAL_REPOSITORY)
    pension = app.get<PensionRepository>(PENSION_REPOSITORY)
  })

  afterEach(async () => {
    await prisma.capital.deleteMany({ where: { userId: { in: [USER, OTHER] } } })
    await prisma.pension.deleteMany({ where: { userId: { in: [USER, OTHER] } } })
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns the Kapital of the asked years only, for this user only', async () => {
    await asDatabaseUser(USER, capital).setField(USER, 2023, 'kapitalertraege', '1200')
    await asDatabaseUser(USER, capital).setField(USER, 2024, 'kapitalertraege', '1500')
    await asDatabaseUser(USER, capital).setField(USER, 2022, 'kapitalertraege', '999')
    await asDatabaseUser(OTHER, capital).setField(OTHER, 2023, 'kapitalertraege', '7777')

    const records = await asDatabaseUser(USER, capital).listForUserAndYears(USER, [2023, 2024, 2025])

    expect(records.map((r) => [r.taxYear, r.kapitalertraege]).sort()).toEqual([[2023, '1200'], [2024, '1500']])
  })

  it('returns the Rente of the asked years only, for this user only', async () => {
    await asDatabaseUser(USER, pension).setField(USER, 2024, 'jahresbetrag', '18000')
    await asDatabaseUser(OTHER, pension).setField(OTHER, 2024, 'jahresbetrag', '1')

    const records = await asDatabaseUser(USER, pension).listForUserAndYears(USER, [2023, 2024])

    expect(records.map((r) => [r.taxYear, r.jahresbetrag])).toEqual([[2024, '18000']])
  })

  it('answers no years with nothing, without a query', async () => {
    expect(await asDatabaseUser(USER, capital).listForUserAndYears(USER, [])).toEqual([])
    expect(await asDatabaseUser(USER, pension).listForUserAndYears(USER, [])).toEqual([])
  })
})
