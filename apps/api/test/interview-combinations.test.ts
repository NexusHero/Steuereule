// #450 5J — gate combinations from the minimal gate all the way to the estimate, as ONE table. Each row
// names the answers, the gate the interview shows next (core `nextStep`) and what the estimate must
// do (core numbers, never hand-typed euro values); a new combination is a new row.
//
// The rows that end in `nicht-moeglich` are the honest states for a person the estimate does not
// cover yet (Rente, Beides …): the cockpit must say so instead of computing a wrong span.
import { describe, expect, it } from 'vitest'
import { getTaxYearParameters, nextStep } from '@steuereule/core'
import type { MasterDataRecord } from '../src/master-data/master-data.repository.js'
import { TaxEstimateService, type TaxEstimateStatus } from '../src/tax-estimate/tax-estimate.service.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const YEAR = 2025
const PARAMS = getTaxYearParameters(YEAR)
const RELIEF = PARAMS.children.singleParentReliefEur
const RELIEF_EXTRA_CHILD = PARAMS.children.singleParentAdditionalChildEur

type Answers = Record<string, string>
const BASE: Answers = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

async function estimate(answers: Answers, married = false): Promise<TaxEstimateStatus> {
  const lstb = new FakeLstbRepository()
  const interview = new FakeInterviewAnswerRepository()
  const masterData = new FakeMasterDataRepository()
  const service = new TaxEstimateService(
    lstb,
    interview,
    new FakeChSalaryCertificateRepository(),
    masterData,
    { findForUserAndYear: async () => null, save: async (_u, _y, e) => e },
    new FakeLinkRepository(),
    new FakeChildRepository(),
    new FakeRentalRepository(),
  )
  interview.seed('u', YEAR, answers)
  if (married) await masterData.save('u', { familienstand: 'verheiratet' } as MasterDataRecord)
  lstb.seed({ userId: 'u', taxYear: YEAR, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
  return service.getState('u', YEAR)
}

function span(status: TaxEstimateStatus) {
  if (status.kind !== 'spanne') throw new Error(`expected a span, got ${JSON.stringify(status)}`)
  return status
}

interface Row {
  readonly name: string
  readonly answers: Answers
  /** What the interview shows after the four gate answers. */
  readonly gate: { kind: 'done' } | { kind: 'gate'; id: string }
  /** What the estimate must be. */
  readonly estimate: { kind: 'nicht-moeglich'; reason: string } | { kind: 'offen'; missing: string[] } | { kind: 'spanne'; taxableDeltaVsLedig: number }
}

const ROWS: readonly Row[] = [
  { name: 'Rente + verheiratet', answers: { ...BASE, job: 'Rente', familienstand: 'Verheiratet', 'partner-job': 'Rente' }, gate: { kind: 'done' }, estimate: { kind: 'offen', missing: ['veranlagungsart'] } },
  { name: 'Rente + Schweiz', answers: { ...BASE, job: 'Rente', ausland: 'Ja, in die Schweiz' }, gate: { kind: 'done' }, estimate: { kind: 'offen', missing: ['rente'] } },
  { name: 'Beides + Kinder', answers: { ...BASE, job: 'Beides', kinder: '2 oder mehr' }, gate: { kind: 'gate', id: 'gewerbe' }, estimate: { kind: 'nicht-moeglich', reason: 'nur-angestellte' } },
  { name: 'Verwitwet + 1 Kind (§ 24b)', answers: { ...BASE, kinder: '1 Kind', familienstand: 'Verwitwet' }, gate: { kind: 'done' }, estimate: { kind: 'spanne', taxableDeltaVsLedig: RELIEF } },
  { name: 'Geschieden ohne Kind', answers: { ...BASE, familienstand: 'Geschieden oder getrennt' }, gate: { kind: 'done' }, estimate: { kind: 'spanne', taxableDeltaVsLedig: 0 } },
  { name: 'Alleinerziehend + 2 Kinder (Erhöhungsbetrag)', answers: { ...BASE, kinder: '2 oder mehr' }, gate: { kind: 'done' }, estimate: { kind: 'spanne', taxableDeltaVsLedig: RELIEF + RELIEF_EXTRA_CHILD } },
  { name: 'Alleinerziehend, aber Haushaltsgemeinschaft', answers: { ...BASE, kinder: '1 Kind', 'ae-haushaltsgemeinschaft': 'Ja' }, gate: { kind: 'done' }, estimate: { kind: 'spanne', taxableDeltaVsLedig: 0 } },
  { name: 'Verheiratet + anderes Land (ch-only gate)', answers: { ...BASE, familienstand: 'Verheiratet', ausland: 'In ein anderes Land' }, gate: { kind: 'gate', id: 'ch-only' }, estimate: { kind: 'offen', missing: ['veranlagungsart'] } },
]

describe('#450 5J — gate combinations up to the estimate', () => {
  it.each(ROWS)('$name', async ({ answers, gate, estimate: expected }) => {
    expect(nextStep(answers as never)).toMatchObject(gate)
    const status = await estimate(answers, answers.familienstand === 'Verheiratet')

    if (expected.kind === 'spanne') {
      const baseline = span(await estimate(BASE))
      const got = span(status)
      expect(baseline.taxableIncome.from - got.taxableIncome.from).toBe(expected.taxableDeltaVsLedig)
      expect(got.result.from).toBeLessThanOrEqual(got.result.to)
      // Relief only ever helps: the refund never gets smaller than the plain single's.
      expect(got.result.from).toBeGreaterThanOrEqual(baseline.result.from)
    } else {
      expect(status).toMatchObject(expected)
    }
  })

  it('every row has a distinct name (a new combination is a new row, not an edit)', () => {
    expect(new Set(ROWS.map((r) => r.name)).size).toBe(ROWS.length)
  })
})
