// Real Postgres (ADR-0004): the cap an assistant's `kind_anlegen` passes to the repository (ADR-0052
// amendment 9) has to hold when calls arrive together, which only the real lock can show.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../src/children/child.repository.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { asDatabaseUser, fixtureClient } from './support/database-fixture.js'

const YEAR = 2025
const child = (i: number) => ({ firstName: `Kind${i}`, lastName: 'Test', geburtsdatum: '2015-01-01' })

describe('PrismaChildRepository.create with a cap, real Postgres', () => {
  let app: NestFastifyApplication
  let prisma: PrismaClient
  let repository: ChildRepository

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = fixtureClient(app.get(PrismaService))
    repository = app.get<ChildRepository>(CHILD_REPOSITORY)
  })

  afterEach(async () => {
    await prisma.child.deleteMany({ where: { userId: { in: ['child-cap-user', 'child-cap-other'] } } })
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
  })

  afterAll(async () => {
    await app.close()
  })

  it('creates in parallel stop exactly at the cap and take distinct sequence numbers', async () => {
    const cap = 3

    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => asDatabaseUser('child-cap-user', repository).create('child-cap-user', YEAR, child(i), cap)))

    const created = results.filter((record) => record !== null)
    expect(created).toHaveLength(cap)
    expect(created.map((record) => record.sequenceNumber).sort()).toEqual([1, 2, 3])
    expect(await prisma.child.count({ where: { userId: 'child-cap-user', taxYear: YEAR } })).toBe(cap)
    // Another account, and another year of the same account, have their own count.
    expect(await asDatabaseUser('child-cap-other', repository).create('child-cap-other', YEAR, child(0), cap)).not.toBeNull()
    expect(await asDatabaseUser('child-cap-user', repository).create('child-cap-user', YEAR + 1, child(0), cap)).not.toBeNull()
  })

  it('without a cap it creates as before', async () => {
    const records = await Promise.all(Array.from({ length: 4 }, (_, i) => asDatabaseUser('child-cap-user', repository).create('child-cap-user', YEAR, child(i))))
    expect(records.map((record) => record.sequenceNumber).sort()).toEqual([1, 2, 3, 4])
  })
})
