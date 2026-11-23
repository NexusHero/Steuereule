// Characterisation of every screen's read/write adapter behind `fieldAccessFrom`: what each field
// takes, what it refuses and what a read gives back afterwards. The snapshot pins the behaviour so
// the adapters can move between files without changing it.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Screen } from '@steuereule/core'
import { DomainError } from '../src/common/domain-error.js'
import { fieldAccessFrom, type FieldAccess, type ScreenAccess } from '../src/confirmation/field-access.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const USER = 'user-1'
const YEAR = 2025

type Write = readonly [field: string, value: string | null]

const BOOLEAN_FIELDS = new Set([
  'kirchensteuerpflichtig',
  'depreciationAsLastYear',
  'domesticResidenceAllYear',
  'registeredWithMeAllYear',
  'childBenefitToMeAllYear',
  'healthInsuranceAbroad',
  'shortestRouteConfirmed',
  'secondShortestRouteConfirmed',
  'nGreSonderfaelle',
  'kvZuschussAnspruch',
  'familienzulagenImBruttolohn',
])

/** A value most fields of a screen take; the special cases follow in `EDGE_WRITES`. */
function sampleValue(screen: Screen, field: string): string {
  if (BOOLEAN_FIELDS.has(field)) return 'true'
  if (screen === 'commute') {
    if (field === 'workdays') return '1,2,3,4'
    if (field === 'transport' || field === 'secondTransport') return 'pkw'
    if (field === 'publicHolidayRegion') return 'BW'
    if (['periodFrom', 'secondFrom'].includes(field)) return '01.01.2025'
    if (['periodTo', 'secondTo'].includes(field)) return '31.12.2025'
    if (field === 'workplace' || field === 'secondWorkplace') return 'Werkstr. 1, 79539 Lörrach'
  }
  if (screen === 'assessment') {
    if (field === 'assessmentDate') return '2026-06-15'
    if (field === 'erlaeuterungen') return '  Die Fahrtkosten wurden gekürzt.  '
  }
  if (screen === 'kopplung' && field === 'filingType') return 'zusammen'
  if (screen === 'kapital' && field === 'inhaber') return 'gemeinsam'
  if (screen === 'chLohnausweis') {
    if (field === 'wechselkurs') return '1,05'
    if (field === 'wechselkursMonat') return '2025-03'
  }
  // Every question has its own accepted answers (core); '' takes an answer back and is always allowed.
  if (screen === 'interview') return ''
  return '12'
}

const EDGE_WRITES: Readonly<Partial<Record<Screen, readonly Write[]>>> = {
  lstb: [['kirchensteuer', '300'], ['kirchensteuerEhegatte', '40'], ['kirchensteuer', null], ['zuschuesseKvPv', null], ['bruttoarbeitslohn', null], ['unknown', '1']],
  rente: [['rentenart', 'gesetzlich'], ['rentenart', null], ['jahresbetrag', null]],
  kapital: [['inhaber', 'A'], ['inhaber', 'C'], ['inhaber', null]],
  vermietung: [['depreciationAsLastYear', 'false'], ['depreciationAsLastYear', null], ['livingArea', null], ['mieteinnahmen', null]],
  profil: [['firstName', 'Lena'], ['steuerId', '12345678901'], ['firstName', null]],
  stammdaten: [['religion', 'rk'], ['religion', null], ['kirchensteuerpflichtig', 'false'], ['kirchensteuerpflichtig', null], ['plz', '79539']],
  kopplung: [['filingType', 'einzel'], ['filingType', 'anything'], ['invitationCode', 'ABC123'], ['invitationCode', null], ['unknown', '1']],
  interview: [['job', 'Angestellt'], ['job', 'angestellt'], ['job', ''], ['job', null]],
  chLohnausweis: [
    ['wechselkurs', '0'],
    ['wechselkurs', 'abc'],
    ['wechselkurs', null],
    ['wechselkursMonat', '2025'],
    ['wechselkursMonat', '2025-13'],
    ['wechselkursMonat', null],
    ['wechselkurs', '0.95'],
    ['nGreSonderfaelle', 'yes'],
    ['nGreSonderfaelle', 'false'],
    ['nGreSonderfaelle', null],
    ['bemerkungen', null],
    ['saeule3aChf', null],
    ['arbeitgeberName', null],
    ['unknown', '1'],
  ],
  kind: [['domesticResidenceAllYear', 'false'], ['domesticResidenceAllYear', 'maybe'], ['healthInsuranceAbroad', null], ['firstName', 'Noah'], ['kinship', null]],
  commute: [
    ['workdays', null],
    ['workdays', ''],
    ['workdays', '1, 1, 8'],
    ['workdays', '5,1,5'],
    ['vacationDays', null],
    ['vacationDays', '367'],
    ['vacationDays', '1.5'],
    ['vacationDays', '300'],
    ['oneWayKm', null],
    ['oneWayKm', ' 32 '],
    ['oneWayKm', '1000'],
    ['transport', 'rakete'],
    ['transport', null],
    ['secondTransport', 'rakete'],
    ['publicHolidays', '31'],
    ['publicHolidays', null],
    ['publicHolidayRegion', 'far-too-long'],
    ['publicHolidayRegion', '  '],
    ['travelDays', '400'],
    ['travelDays', '366'],
    ['travelDays', null],
    ['shortestRouteConfirmed', 'yes'],
    ['shortestRouteConfirmed', null],
    ['workplace', `  ${'x'.repeat(130)}  `],
    ['workplace', '   '],
    ['workplace', null],
    ['periodFrom', '2025-01-01'],
    ['periodFrom', ''],
    ['periodFrom', null],
    ['unknown', '1'],
  ],
  assessment: [
    ['assessmentDate', '15.06.2026'],
    ['assessmentDate', null],
    ['erlaeuterungen', 'x'.repeat(4_001)],
    ['erlaeuterungen', '   '],
    ['erlaeuterungen', null],
    ['festgesetzteSteuer', 'unklar'],
    ['festgesetzteSteuer', ' 11450 '],
    ['festgesetzteSteuer', '11450.5'],
    ['festgesetzteSteuer', '-1'],
    ['festgesetzteSteuer', '99999999999'],
    ['erstattung', '-250'],
    ['einnahmen', null],
    ['unknown', '1'],
  ],
}

async function outcome(access: ScreenAccess, instance: string | null, [field, value]: Write): Promise<string> {
  const label = `${field} = ${value === null ? 'null' : JSON.stringify(value.length > 40 ? `${value.slice(0, 12)}…(${value.length})` : value)}`
  try {
    return `${label} -> ${await access.write(USER, YEAR, instance, field, value)}`
  } catch (error) {
    if (error instanceof DomainError) return `${label} -> ${error.code}: ${error.message}`
    return `${label} -> threw ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
  }
}

async function characterise(access: ScreenAccess, screen: Screen, instance: string | null) {
  const empty = await access.read(USER, YEAR, instance)
  const samples: string[] = []
  for (const field of access.fields) samples.push(await outcome(access, instance, [field, sampleValue(screen, field)]))
  const afterSamples = await access.read(USER, YEAR, instance)
  const edges: string[] = []
  for (const write of EDGE_WRITES[screen] ?? []) edges.push(await outcome(access, instance, write))
  return { fields: access.fields, withInstance: access.withInstance, empty, samples, afterSamples, edges, afterEdges: await access.read(USER, YEAR, instance) }
}

describe('the field access of every screen, characterised', () => {
  let rental: FakeRentalRepository
  let child: FakeChildRepository
  let link: FakeLinkRepository
  let masterData: FakeMasterDataRepository
  let access: FieldAccess

  beforeEach(() => {
    rental = new FakeRentalRepository()
    child = new FakeChildRepository()
    link = new FakeLinkRepository()
    masterData = new FakeMasterDataRepository()
    access = fieldAccessFrom({
      lstb: new FakeLstbRepository(),
      pension: new FakePensionRepository(),
      capital: new FakeCapitalRepository(),
      rental,
      profile: new FakeProfileRepository(),
      masterData,
      link,
      interview: new FakeInterviewAnswerRepository(),
      chSalaryCertificate: new FakeChSalaryCertificateRepository(),
      child,
      commute: new FakeCommuteRepository(),
      assessment: new FakeAssessmentRepository(),
    })
  })

  it('serves exactly these screens, and only the four required ones without their repositories', () => {
    expect(Object.keys(access)).toMatchInlineSnapshot(`
      [
        "lstb",
        "rente",
        "kapital",
        "vermietung",
        "profil",
        "stammdaten",
        "kopplung",
        "interview",
        "chLohnausweis",
        "kind",
        "commute",
        "assessment",
      ]
    `)
    const minimal = fieldAccessFrom({ lstb: new FakeLstbRepository(), pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental })
    expect(Object.keys(minimal)).toEqual(['lstb', 'rente', 'kapital', 'vermietung'])
    const booking = { fields: ['entry'], withInstance: true, read: async () => null, write: async () => false }
    const withBooking = fieldAccessFrom({ lstb: new FakeLstbRepository(), pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental, booking })
    expect(withBooking.buchung).toBe(booking)
  })

  it.each(['lstb', 'rente', 'kapital', 'profil', 'stammdaten', 'kopplung', 'interview', 'chLohnausweis', 'commute', 'assessment'] satisfies Screen[])(
    '%s',
    async (screen) => {
      expect(await characterise(access[screen]!, screen, null)).toMatchSnapshot()
    },
  )

  it('vermietung, by object', async () => {
    const own = await rental.create(USER, YEAR)
    const foreign = await rental.create('user-2', YEAR)
    const screen = access.vermietung!
    expect(await characterise(screen, 'vermietung', own.id)).toMatchSnapshot()
    expect(await screen.read(USER, YEAR, null)).toBeNull()
    expect(await screen.read(USER, YEAR, foreign.id)).toBeNull()
    expect(await screen.write(USER, YEAR, null, 'mieteinnahmen', '1')).toBe(false)
    expect(await screen.write(USER, YEAR, foreign.id, 'mieteinnahmen', '1')).toBe(false)
    expect(await screen.write(USER, YEAR, foreign.id, 'plz', '79539')).toBe(false)
  })

  it('kind, by child', async () => {
    const own = await child.create(USER, YEAR, { firstName: 'Noah', lastName: 'Brenner', geburtsdatum: '2020-01-01' })
    const foreign = await child.create('user-2', YEAR, { firstName: 'Mia', lastName: 'Fremd', geburtsdatum: '2019-01-01' })
    const screen = access.kind!
    expect(await characterise(screen, 'kind', own.id)).toMatchSnapshot()
    expect(await screen.read(USER, YEAR, null)).toBeNull()
    expect(await screen.read(USER, YEAR, foreign.id)).toBeNull()
    expect(await screen.write(USER, YEAR, null, 'kinship', '1')).toBe(false)
    expect(await screen.write(USER, YEAR, foreign.id, 'kinship', '1')).toBe(false)
  })

  it('kopplung sets the Veranlagungsart through the link service when one is given, and stores the code itself', async () => {
    const calls: unknown[] = []
    const withService = fieldAccessFrom({
      lstb: new FakeLstbRepository(),
      pension: new FakePensionRepository(),
      capital: new FakeCapitalRepository(),
      rental,
      link,
      linkFilingType: async (...args) => {
        calls.push(args)
      },
    }).kopplung!
    expect(await withService.write(USER, YEAR, null, 'filingType', 'zusammen')).toBe(true)
    expect(await withService.write(USER, YEAR, null, 'filingType', 'anything')).toBe(true)
    expect(calls).toEqual([[USER, YEAR, 'zusammen'], [USER, YEAR, 'einzel']])
    expect(await link.findByUserAndYear(USER, YEAR)).toBeNull()
    expect(await withService.write(USER, YEAR, null, 'invitationCode', 'ABC123')).toBe(true)
    expect(await link.findByUserAndYear(USER, YEAR)).toMatchObject({ personBUserId: '', filingType: 'einzel', invitationCode: 'ABC123' })
  })

  it('stammdaten stores the religion with the moment of the consent and takes both back together', async () => {
    const screen = access.stammdaten!
    await screen.write(USER, YEAR, null, 'religion', 'rk')
    expect((await masterData.findByUserId(USER))?.religionEinwilligungAm).toBeInstanceOf(Date)
    await screen.write(USER, YEAR, null, 'beruf', 'Ingenieurin')
    expect((await masterData.findByUserId(USER))?.religionEinwilligungAm).toBeInstanceOf(Date)
    await screen.write(USER, YEAR, null, 'religion', null)
    expect((await masterData.findByUserId(USER))?.religionEinwilligungAm).toBeNull()
  })

  it('commute works without the master data: the region then comes from the workplace alone', async () => {
    const commute = new FakeCommuteRepository()
    const screen = fieldAccessFrom({ lstb: new FakeLstbRepository(), pension: new FakePensionRepository(), capital: new FakeCapitalRepository(), rental, commute }).commute!
    expect(await screen.write(USER, YEAR, null, 'oneWayKm', '10')).toBe(true)
    expect((await commute.findForUserAndYear(USER, YEAR))?.publicHolidayRegion ?? null).toBeNull()
    expect(await screen.write(USER, YEAR, null, 'workplace', 'Werkstr. 1, 79539 Lörrach')).toBe(true)
    expect((await commute.findForUserAndYear(USER, YEAR))?.publicHolidayRegion).toBe('BW')
  })
})
