// ADR-0066 — the euro effect on a draft card is the app's own estimate, run twice against real
// Postgres: once for the stored return, once with the draft written. The second run happens in a
// transaction that is rolled back, so a preview must leave no trace.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdvisorService } from '../src/advisor/advisor.service.js'
import { AppModule } from '../src/app.module.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../src/rental/rental.repository.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'

const YEAR = 2025

describe('effect preview through the real estimate', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let advisor: AdvisorService
  let confirmation: ConfirmationService
  let estimate: TaxEstimateService
  const employee = `it-preview-${randomUUID()}`
  const blank = `it-preview-blank-${randomUUID()}`

  const write = (userId: string, key: string, value: string) => confirmation.writeConfirmedByAdvisor(userId, YEAR, key, value)

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
    advisor = app.get(AdvisorService)
    confirmation = app.get(ConfirmationService)
    estimate = app.get(TaxEstimateService)

    await write(employee, 'interview.job', 'Angestellt')
    await write(employee, 'interview.familienstand', 'Ledig')
    await write(employee, 'lstb.bruttoarbeitslohn', '62000')
    await write(employee, 'lstb.lohnsteuer', '11800')
    await write(employee, 'lstb.sozialversicherung', '11400')
    await write(blank, 'interview.job', 'Angestellt')
  }, 60_000)

  afterAll(async () => {
    for (const userId of [employee, blank]) {
      const tables = prisma as unknown as Record<string, { deleteMany(args: unknown): Promise<unknown> } | undefined>
      for (const table of ['marking', 'interviewAnswer', 'taxDataAccessLog', 'commute', 'lstb', 'rentalProperty', 'taxYear']) {
        await tables[table]?.deleteMany({ where: { userId } }).catch(() => {})
      }
    }
    await app.close()
  })

  it('starts from a return the estimate can compute', async () => {
    expect((await estimate.getState(employee, YEAR)).kind).toBe('spanne')
  })

  it('puts a donation in euros and stores nothing', async () => {
    const preview = advisor.previewEffectFor(employee, YEAR)!
    const before = await estimate.getState(employee, YEAR)

    const effect = await preview({ screen: 'interview', instance: null, values: [['spenden', 'Ja'], ['spenden-betrag', '1000']] })

    expect(effect.kind).toBe('computed')
    if (effect.kind !== 'computed') return
    expect(effect.deltaEur).toBeGreaterThan(100)
    expect(effect.afterRefundEur - effect.beforeRefundEur).toBe(effect.deltaEur)
    // Nothing of the preview is left: no answer, no marking, the same estimate as before.
    expect(await confirmation.readRawValue(employee, YEAR, 'interview.spenden-betrag')).toBeNull()
    expect(await confirmation.readRawValue(employee, YEAR, 'interview.spenden')).toBeNull()
    expect(await estimate.getState(employee, YEAR)).toEqual(before)
  })

  it('agrees with what the estimate says once the draft is really applied', async () => {
    const preview = advisor.previewEffectFor(employee, YEAR)!
    const effect = await preview({ screen: 'commute', instance: null, values: [['oneWayKm', '38']] })
    expect(effect.kind).toBe('computed')

    await write(employee, 'commute.oneWayKm', '38')
    const applied = await estimate.getState(employee, YEAR)
    expect(applied.kind).toBe('spanne')
    if (effect.kind !== 'computed' || applied.kind !== 'spanne') return
    expect(Math.round((applied.result.from + applied.result.to) / 2)).toBe(effect.afterRefundEur)
  })

  it('previews a rental object by its stored record', async () => {
    const rental = await app.get<RentalRepository>(RENTAL_REPOSITORY).create(employee, YEAR)
    const preview = advisor.previewEffectFor(employee, YEAR)!
    const effect = await preview({ screen: 'vermietung', instance: rental.id, values: [['mieteinnahmen', '9600']] })
    expect(['computed', 'not-computable']).toContain(effect.kind)
    expect(await confirmation.readRawValue(employee, YEAR, `vermietung:${rental.id}.mieteinnahmen`)).toBeNull()
  })

  it('names no figure while the return cannot be estimated yet', async () => {
    const preview = advisor.previewEffectFor(blank, YEAR)!
    const effect = await preview({ screen: 'interview', instance: null, values: [['spenden', 'Ja'], ['spenden-betrag', '1000']] })
    expect(effect).toMatchObject({ kind: 'not-computable' })
    expect(await confirmation.readRawValue(blank, YEAR, 'interview.spenden-betrag')).toBeNull()
  })

  it('refuses to guess when the draft itself cannot be written', async () => {
    const preview = advisor.previewEffectFor(employee, YEAR)!
    const effect = await preview({ screen: 'interview', instance: null, values: [['spenden-betrag', 'viel']] })
    expect(effect).toMatchObject({ kind: 'not-computable' })
  })
})
