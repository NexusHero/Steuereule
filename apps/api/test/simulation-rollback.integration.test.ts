// Real-Postgres proof (ADR-0004) for MCP-22: `auswirkung_simulieren` and `szenario_simulieren` write on trial
// inside a transaction that is always rolled back. Every repository the trial write reaches must join it; the
// Kopplung repository did not, so a simulated Veranlagungsart stayed — „einzel“ cut the partner link, „zusammen“
// created a Person B. After a simulation the database is the same as before, row for row.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../src/link/link.repository.js'
import { McpReportService } from '../src/mcp/mcp-report.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

const YEAR = 2025

type Delegate = { count(): Promise<number>; findMany(args?: object): Promise<unknown[]> }

describe('a simulation leaves the database as it was — real Postgres', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let report: McpReportService
  let links: PartnerCouplingRepository
  const userIds: string[] = []

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
    report = app.get(McpReportService)
    links = app.get(PARTNER_COUPLING_REPOSITORY)
  })

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      const shadow = `spouse_${userId}_${YEAR}`
      await prisma.taxYearLink.deleteMany({ where: { OR: [{ personAUserId: userId }, { personBUserId: userId }] } })
      for (const id of [userId, shadow]) {
        await prisma.marking.deleteMany({ where: { userId: id } })
        await prisma.profile.deleteMany({ where: { userId: id } })
        await prisma.taxDataAccessLog.deleteMany({ where: { userId: id } })
      }
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function newUser(): string {
    const userId = `simulation-${randomUUID()}`
    userIds.push(userId)
    return userId
  }

  /** Every table: its row count, and the rows of this user (and of her placeholder Person B) where it has a user column. */
  async function snapshot(userId: string): Promise<Record<string, unknown>> {
    const people = [userId, `spouse_${userId}_${YEAR}`]
    const out: Record<string, unknown> = {}
    for (const model of Prisma.dmmf.datamodel.models) {
      const delegate = (prisma as unknown as Record<string, Delegate | undefined>)[model.name.charAt(0).toLowerCase() + model.name.slice(1)]
      if (delegate === undefined) continue
      const columns = new Set(model.fields.map((f) => f.name))
      const owner = ['userId', 'personAUserId', 'personBUserId', 'householdUserId'].filter((c) => columns.has(c))
      out[model.name] = {
        count: await delegate.count(),
        ...(owner.length === 0 ? {} : { rows: await delegate.findMany({ where: { OR: owner.map((c) => ({ [c]: { in: people } })) } }) }),
      }
    }
    return out
  }

  it.each([['zusammen'], ['einzel']])('auswirkung_simulieren on kopplung.filingType = %s changes nothing', async (filingType) => {
    const userId = newUser()
    // A joint return the user has, with her placeholder Person B: „einzel“ on trial must not cut it.
    if (filingType === 'einzel') await links.upsert(userId, YEAR, { personBUserId: `spouse_${userId}_${YEAR}`, filingType: 'zusammen', invitationCode: null, invitationCodeValidUntil: null })
    const before = await snapshot(userId)

    await report.simulate(userId, YEAR, 'kopplung', 'filingType', filingType)

    expect(await snapshot(userId)).toEqual(before)
  })

  it('szenario_simulieren with several entries, the Kopplung among them, changes nothing', async () => {
    const userId = newUser()
    const before = await snapshot(userId)

    await report.simulateEntries(userId, YEAR, [
      { screen: 'kopplung', field: 'filingType', value: 'zusammen' },
      { screen: 'lstb', field: 'bruttoarbeitslohn', value: '48000' },
    ])

    expect(await snapshot(userId)).toEqual(before)
  })
})
