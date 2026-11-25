// Real-Postgres proof (ADR-0004) for API-21: a child or a rental object takes its markings and proposals along
// when it is deleted, whichever path deletes it (the mask, the household, the owl's undo, the assistant) —
// all of them end in the repository's delete.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../src/children/child.repository.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../src/marking/marking.repository.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../src/rental/rental.repository.js'
import { runAsDatabaseUser } from '../src/common/database-identity.js'
import { fixtureClient } from './support/database-fixture.js'

const YEAR = 2025
const CLAUDE = { kind: 'assistent', name: 'Claude' } as const

describe('deleting a record deletes its markings — real Postgres', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let markings: ProvenanceRepository
  let children: ChildRepository
  let rentals: RentalRepository
  const userIds: string[] = []

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = fixtureClient(app.get(PrismaService))
    markings = app.get(PROVENANCE_REPOSITORY)
    children = app.get(CHILD_REPOSITORY)
    rentals = app.get(RENTAL_REPOSITORY)
  })

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await prisma.marking.deleteMany({ where: { userId } })
      await prisma.child.deleteMany({ where: { userId } })
      await prisma.rentalProperty.deleteMany({ where: { userId } })
      await prisma.taxDataAccessLog.deleteMany({ where: { userId } })
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function newUser(): string {
    const userId = `deletion-${randomUUID()}`
    userIds.push(userId)
    return userId
  }

  it('a deleted child leaves no marking or proposal, and the other child keeps hers', async () => {
    const userId = newUser()
    await runAsDatabaseUser(userId, async () => {
      const gone = (await children.create(userId, YEAR, { firstName: 'Mia', lastName: 'Muster', geburtsdatum: '2018-04-01' }))!
      const stays = (await children.create(userId, YEAR, { firstName: 'Ben', lastName: 'Muster', geburtsdatum: '2020-04-01' }))!
      await markings.save(userId, YEAR, { key: `kind:${gone.id}.childcareEur`, provenance: CLAUDE, confirmed: false, proposal: null })
      await markings.save(userId, YEAR, { key: `kind:${gone.id}.firstName`, provenance: { kind: 'nutzer' }, confirmed: true, proposal: { value: 'Mila', provenance: CLAUDE } })
      await markings.save(userId, YEAR, { key: `kind:${stays.id}.childcareEur`, provenance: CLAUDE, confirmed: false, proposal: null })

      expect(await children.delete(userId, YEAR, gone.id)).toBe(true)

      expect((await markings.listForUserAndYears(userId, [YEAR])).map((m) => m.key)).toEqual([`kind:${stays.id}.childcareEur`])
    })
  })

  it('a deleted rental object leaves no marking', async () => {
    const userId = newUser()
    await runAsDatabaseUser(userId, async () => {
      const property = await rentals.create(userId, YEAR)
      await markings.save(userId, YEAR, { key: `vermietung:${property.id}.mieteinnahmen`, provenance: CLAUDE, confirmed: false, proposal: null })

      expect(await rentals.delete(userId, YEAR, property.id)).toBe(true)

      expect(await markings.listForUserAndYears(userId, [YEAR])).toEqual([])
    })
  })
})
