import { describe, expect, it } from 'vitest'
import { AMOUNT_LATER } from '@steuereule/core'
import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../src/config/features.js'
import type { CommuteInputs, CommuteRepository } from '../src/commute/commute.repository.js'
import type { MasterDataRecord } from '../src/master-data/master-data.repository.js'
import { TaxEstimateService, type TaxEstimateStatus } from '../src/tax-estimate/tax-estimate.service.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

function range(status: TaxEstimateStatus) {
  if (status.kind !== 'spanne') throw new Error(`expected spanne, got ${status.kind}`)
  return status
}

function emptyCommute(): CommuteRepository {
  return { findForUserAndYear: async () => null as CommuteInputs | null, save: async (_u, _j, e) => e }
}

function setup() {
  const lstb = new FakeLstbRepository()
  const interview = new FakeInterviewAnswerRepository()
  const ch = new FakeChSalaryCertificateRepository()
  const masterData = new FakeMasterDataRepository()
  const link = new FakeLinkRepository()
  const kinder = new FakeChildRepository()
  const rental = new FakeRentalRepository()
  const service = new TaxEstimateService(lstb, interview, ch, masterData, emptyCommute(), link, kinder, rental)
  return { lstb, interview, masterData, link, service }
}

describe('TaxEstimateService — § 35a & § 33 boosters and ADR-0032 feature flag', () => {
  it('ships with HOUSEHOLD_AND_HEALTH_BOOSTERS = false until § 35a/§ 33 printout forms exist', () => {
    expect(HOUSEHOLD_AND_HEALTH_BOOSTERS).toBe(false)
  })

  it('ignores haushalt & gesundheit answers (incl. AMOUNT_LATER) while HOUSEHOLD_AND_HEALTH_BOOSTERS is false', async () => {
    const baseEnv = setup()
    baseEnv.interview.seed('u', 2025, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' })
    baseEnv.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    const baseline = range(await baseEnv.service.getState('u', 2025))

    const gatedEnv = setup()
    gatedEnv.interview.seed('u', 2025, {
      job: 'Angestellt',
      ausland: 'Nein',
      kinder: 'Nein',
      'haushalt-gate': 'Ja',
      'haushalt-handwerker-betrag': AMOUNT_LATER,
      'gesundheit-gate': 'Ja',
      'gesundheit-betrag': '5000',
    })
    gatedEnv.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    const ignored = range(await gatedEnv.service.getState('u', 2025))

    expect(ignored).toEqual(baseline)
  })

  it('applies § 35a household reduction and § 33 medical burden when boosters are enabled (single & couple)', async () => {
    const baseEnv = setup()
    baseEnv.interview.seed('u', 2025, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' })
    baseEnv.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    const baseline = range(await baseEnv.service.getState('u', 2025, true))

    const boostedEnv = setup()
    boostedEnv.interview.seed('u', 2025, {
      job: 'Angestellt',
      ausland: 'Nein',
      kinder: 'Nein',
      'haushalt-gate': 'Ja',
      'haushalt-handwerker-betrag': '3000', // 20 % = 600 EUR tax reduction
      'gesundheit-gate': 'Ja',
      'gesundheit-betrag': '5000', // exceeds reasonable burden at ~43.7k GdE
    })
    boostedEnv.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    const boosted = range(await boostedEnv.service.getState('u', 2025, true))

    expect(boosted.taxableIncome.from).toBeLessThan(baseline.taxableIncome.from)
    expect(boosted.incomeTax.from).toBeLessThan(baseline.incomeTax.from - 600)
    expect(boosted.result.from).toBeGreaterThan(baseline.result.from)

    // Couple joint estimate
    const coupleBase = setup()
    coupleBase.interview.seed('a', 2025, { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' })
    await coupleBase.masterData.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await coupleBase.link.upsert('a', 2025, { personBUserId: 'b', filingType: 'zusammen' })
    coupleBase.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '80000', lohnsteuer: '14000', sozialversicherung: '14000' })
    coupleBase.lstb.seed({ userId: 'b', taxYear: 2025, bruttoarbeitslohn: '40000', lohnsteuer: '6000', sozialversicherung: '8000' })
    const cBase = range(await coupleBase.service.getState('a', 2025, true))

    const coupleBoosted = setup()
    coupleBoosted.interview.seed('a', 2025, {
      job: 'Angestellt',
      ausland: 'Nein',
      kinder: 'Nein',
      familienstand: 'Verheiratet',
      'haushalt-gate': 'Ja',
      'haushalt-dienstleistung-betrag': '5000', // 1000 EUR reduction
      'gesundheit-gate': 'Ja',
      'gesundheit-betrag': '9000',
    })
    await coupleBoosted.masterData.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await coupleBoosted.link.upsert('a', 2025, { personBUserId: 'b', filingType: 'zusammen' })
    coupleBoosted.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '80000', lohnsteuer: '14000', sozialversicherung: '14000' })
    coupleBoosted.lstb.seed({ userId: 'b', taxYear: 2025, bruttoarbeitslohn: '40000', lohnsteuer: '6000', sozialversicherung: '8000' })
    const cBoosted = range(await coupleBoosted.service.getState('a', 2025, true))

    expect(cBoosted.taxableIncome.from).toBeLessThan(cBase.taxableIncome.from)
    expect(cBoosted.incomeTax.from).toBeLessThan(cBase.incomeTax.from - 1000)
  })
})
