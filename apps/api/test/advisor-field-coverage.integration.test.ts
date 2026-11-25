// #476 — "the owl can fill every field it is told about", against real Postgres.
// The system prompt lists AI_WRITABLE_FIELDS to the model. This walks that list and writes each
// field through the same path "✓ Jetzt übernehmen" uses. A field that takes none of the plausible
// values is a field the owl would produce a dead draft for.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { QUESTIONS, fieldSpec, provenanceKey, type Screen } from '@steuereule/core'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../src/children/child.repository.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { AI_WRITABLE_FIELDS, aiWritableFields } from '../src/ki/advisor-safety.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { runAsDatabaseUser } from '../src/common/database-identity.js'
import { fixtureClient } from './support/database-fixture.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../src/rental/rental.repository.js'

const YEAR = 2025

/** Values a model would plausibly send; the first one a field accepts counts. */
// A German date (TT.MM.JJJJ) for the fields that take one, e.g. the period of a way to work (ADR-0079).
// 'A' for the person a child's Swiss Kinderzulage comes with (ADR-0088), last so it never wins over a real value.
// ADR-0091: 'zusammen' for the Veranlagungsart, '1.065' for the Wechselkurs, a Steuer-ID, an IBAN, a religion key and a marital status.
const GENERIC_CANDIDATES = ['1200', '12', '2025-06-30', '30.06.2025', 'true', 'pkw', '1,2,3,4,5', 'BY', 'GesetzlicheRente', '1', 'Inland', '1995', '2019', 'A', 'zusammen', '1.065', '12345678901', 'DE89370400440532013000', 'VD', 'ledig']

function candidatesFor(screen: Screen, field: string): string[] {
  if (screen === 'interview') {
    const form = (QUESTIONS as Readonly<Record<string, { readonly form?: { readonly kind: string; readonly values?: readonly string[] } }>>)[field]?.form
    if (form?.kind === 'enum' && form.values) return [...form.values]
    if (form?.kind === 'integer') return ['100']
  }
  // A field with a fixed set of answers (e.g. chLohnausweis.taggeldQuelle) is tried with its own answers first.
  const spec = fieldSpec(screen, field)?.value
  if (spec?.kind === 'enum') return [...spec.values, ...GENERIC_CANDIDATES]
  return GENERIC_CANDIDATES
}

const NONSENSE = 'xyz-unsinn'
const consent = { personalDataConsent: true }

interface FieldResult {
  readonly key: string
  readonly accepted: string | null
  readonly reasons: readonly string[]
}

describe('every field the owl is told about can be written (#476)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let confirmation: ConfirmationService
  const userId = `it-coverage-${randomUUID()}`
  const results: FieldResult[] = []
  /** Fields that stored an obviously wrong value without complaint. */
  const unguarded: string[] = []

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = fixtureClient(app.get(PrismaService))
    confirmation = app.get(ConfirmationService)

    // As the user, the way the owl's confirmations reach the screens (P11).
    await runAsDatabaseUser(userId, async () => {
      // Screens with several rows a year need one to write to (the owl creates them through a draft, ADR-0091).
      const child = await app.get<ChildRepository>(CHILD_REPOSITORY).create(userId, YEAR, { firstName: 'Mila', lastName: 'Muster', geburtsdatum: '2019-05-12' })
      const rental = await app.get<RentalRepository>(RENTAL_REPOSITORY).create(userId, YEAR)
      const instances: Partial<Record<Screen, string>> = { kind: child.id, vermietung: rental.id }

      // Every field the owl may be told about: with the consent to personal data that is all of them (ADR-0091).
      for (const [screen, fields] of Object.entries(aiWritableFields(true)) as Array<[Screen, readonly string[]]>) {
        for (const field of fields) {
          const key = provenanceKey(screen, field, instances[screen])
          let accepted: string | null = null
          const reasons: string[] = []
          for (const value of candidatesFor(screen, field)) {
            try {
              await confirmation.writeConfirmedByAdvisor(userId, YEAR, key, value, undefined, undefined, consent)
              accepted = value
              break
            } catch (error) {
              const reason = error instanceof Error ? ((error as { code?: string }).code ?? error.message.slice(0, 80)) : String(error)
              if (!reasons.includes(reason)) reasons.push(reason)
            }
          }
          results.push({ key, accepted, reasons })
        }
      }

      // The other direction, after every field holds a valid value: does a field refuse a value that
      // cannot be right? One that stores it is restored at once, so later reads stay possible.
      for (const result of results) {
        if (result.accepted === null) continue
        try {
          await confirmation.writeConfirmedByAdvisor(userId, YEAR, result.key, NONSENSE, undefined, undefined, consent)
          unguarded.push(result.key)
          await confirmation.writeConfirmedByAdvisor(userId, YEAR, result.key, result.accepted, undefined, undefined, consent).catch(() => {})
        } catch {
          // refused, as it should be
        }
      }
    })
  }, 120_000)

  afterAll(async () => {
    for (const table of ['marking', 'interviewAnswer', 'taxDataAccessLog', 'commute', 'child', 'rentalProperty', 'capital', 'chSalaryCertificate', 'lstb', 'pension', 'assessment', 'masterData', 'taxYearLink', 'taxYear'] as const) {
      await (prisma[table] as unknown as { deleteMany(args: unknown): Promise<unknown> }).deleteMany({ where: { userId } }).catch(() => {})
    }
    await app.close()
  })

  it('reports which fields take a value and which take none', () => {
    const dead = results.filter((r) => r.accepted === null)
    const lines = [
      `fields listed to the model: ${results.length}, writable: ${results.length - dead.length}, dead: ${dead.length}`,
      ...dead.map((r) => `  DEAD ${r.key} — ${r.reasons.join(' | ')}`),
    ]
    const byScreen = new Map<string, number>()
    for (const key of unguarded) byScreen.set(key.split('.')[0]!, (byScreen.get(key.split('.')[0]!) ?? 0) + 1)
    lines.push(
      `fields that stored the nonsense value „${NONSENSE}“ without complaint: ${unguarded.length}`,
      ...[...byScreen.entries()].map(([screen, n]) => `  UNGUARDED ${screen}: ${n}`),
      ...unguarded.map((key) => `    ${key}`),
    )
    console.log(`\n[field-coverage]\n${lines.join('\n')}\n`)
    expect(results.length).toBeGreaterThan(100)
  })

  it('refuses a value that cannot be right on every field with a fixed form (ADR-0066)', () => {
    // One invalid interview answer used to make every later read of that user's interview fail,
    // and 51 further fields stored whatever they were given. Free text is the only exception left.
    const fixedForm = unguarded.filter((key) => {
      const [screenPart, field] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)]
      return fieldSpec(screenPart.split(':')[0]!, field)?.value.kind !== 'text'
    })
    expect(fixedForm).toEqual([])
  })

  it('covers what the owl fills since ADR-0091: identity, household, children, the exchange rate, the owner, the rental object', () => {
    const keys = results.map((r) => r.key)
    for (const wanted of ['profil.steuerId', 'stammdaten.iban', 'stammdaten.religion', 'kopplung.filingType', 'chLohnausweis.wechselkurs', 'chLohnausweis.wechselkursMonat', 'kapital.inhaber']) {
      expect(keys, wanted).toContain(wanted)
    }
    for (const field of ['firstName', 'geburtsdatum', 'taxId', 'otherParentName']) expect(keys.some((k) => k.startsWith('kind:') && k.endsWith(`.${field}`)), field).toBe(true)
    for (const field of ['strasse', 'livingArea', 'einheiten', 'depreciationAsLastYear']) expect(keys.some((k) => k.startsWith('vermietung:') && k.endsWith(`.${field}`)), field).toBe(true)
    expect(keys).not.toContain('kopplung.invitationCode')
    expect(Object.values(AI_WRITABLE_FIELDS).flat().length).toBeLessThan(results.length)
  })

  it('lists no field to the model that can never be written', () => {
    expect(results.filter((r) => r.accepted === null).map((r) => r.key)).toEqual([])
  })
})
