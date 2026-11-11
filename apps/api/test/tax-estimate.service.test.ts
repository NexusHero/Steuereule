import { describe, expect, it } from 'vitest'
import { AMOUNT_LATER, UNCERTAINTY_PER_ITEM } from '@steuereule/core'
import type { CommuteInputs, CommuteRepository } from '../src/commute/commute.repository.js'
import type { CrossBorderSalaryStatementRecord } from '../src/ch-salary-certificate/ch-salary-certificate.repository.js'
import type { MasterDataRecord } from '../src/master-data/master-data.repository.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import type { TaxEstimateStatus } from '../src/tax-estimate/tax-estimate.service.js'

function range(status: TaxEstimateStatus) {
  if (status.kind !== 'spanne') throw new Error(`expected a range, got ${status.kind}`)
  return status
}

function commute(inputs: CommuteInputs | null): CommuteRepository {
  return { findForUserAndYear: async () => inputs, save: async (_u, _j, e) => e }
}

function setup(path: CommuteInputs | null = null) {
  const lstb = new FakeLstbRepository()
  const interview = new FakeInterviewAnswerRepository()
  const ch = new FakeChSalaryCertificateRepository()
  const masterData = new FakeMasterDataRepository()
  const link = new FakeLinkRepository()
  const kinder = new FakeChildRepository()
  const rental = new FakeRentalRepository()
  const service = new TaxEstimateService(lstb, interview, ch, masterData, commute(path), link, kinder, rental)
  return { lstb, interview, ch, stammdaten: masterData, kopplung: link, kinder, vermietung: rental, service }
}

const EMPLOYED = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' }

describe('SteuerschaetzungService', () => {
  it('estimates the refund for a complete Lohnsteuerbescheinigung', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, EMPLOYED)
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    const status = range(await service.getState('u', 2025))

    expect(status.result.from).toBeGreaterThan(0)
    expect(status.result.from).toBeLessThan(status.result.to)
  })

  it('takes the Entfernungspauschale from the stored commute', async () => {
    const { lstb, interview, service } = setup({
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 30,
      sickDays: 5,
      homeOfficeDays: 20,
      oneWayKm: 30,
      transport: 'pkw',
      workplace: null,
    })
    interview.seed('u', 2025, EMPLOYED)
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    const status = range(await service.getState('u', 2025))

    // Entfernungspauschale 2.019 € plus Homeoffice-Pauschale 20 Tage × 6 € = 120 € (#450 Teil 6).
    expect(status.werbungskosten).toBe(2019 + 120)
  })

  it('names what is still missing instead of estimating from an incomplete LStB', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, EMPLOYED)
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: null, sozialversicherung: null })

    const status = await service.getState('u', 2025)

    expect(status).toMatchObject({ kind: 'offen', missing: ['lohnsteuer', 'sozialversicherung'] })
  })

  it('never estimates a married person as single — it asks for the joint return first (ADR-0054)', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, familienstand: 'Verheiratet' })
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    expect(await service.getState('u', 2025)).toEqual({ kind: 'offen', missing: ['veranlagungsart'] })
  })

  it("estimates a couple with the splitting tariff from both spouses' certificates and the rental surplus", async () => {
    const { lstb, interview, stammdaten: masterData, kopplung: link, vermietung: rental, service } = setup()
    interview.seed('a', 2025, EMPLOYED)
    await masterData.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await link.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
    lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
    lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '10420', sozialversicherung: '10008' })
    rental.seed({
      id: 'o1', userId: 'a', taxYear: 2025, mieteinnahmen: '14400', anschaffungskosten: '280000', baujahr: '1995', werbungskosten: '3200',
    } as never)

    const status = range(await service.getState('a', 2025))
    expect(status.jointAssessment).toBe(true)
    expect(status.anrechnung).toBe(9890 + 10420)
    const withoutRent = range(await (async () => {
      const second = setup()
      second.interview.seed('a', 2025, EMPLOYED)
      await second.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
      await second.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
      second.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
      second.lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '10420', sozialversicherung: '10008' })
      return second.service.getState('a', 2025)
    })())
    // 14.400 rent − 3.200 costs − 5.600 AfA = 5.600 more income → more tax.
    expect(status.incomeTax.from).toBeGreaterThan(withoutRent.incomeTax.from)
  })

  it("names what is missing in Person B's figures", async () => {
    const { lstb, interview, stammdaten: masterData, kopplung: link, service } = setup()
    interview.seed('a', 2025, EMPLOYED)
    await masterData.save('a', { familienstand: 'verheiratet' } as MasterDataRecord)
    await link.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
    lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
    lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '48000', lohnsteuer: null, sozialversicherung: '10008' } as never)

    const status = await service.getState('a', 2025)
    expect(status).toMatchObject({ kind: 'offen' })
    expect(status.kind === 'offen' && status.missing.some((f) => f.startsWith('personB.'))).toBe(true)
  })

  it('estimates a Grenzgänger from the Lohnausweis against the Quellensteuer', async () => {
    const { interview, ch, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, ausland: 'Ja, in die Schweiz', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' })
    ch.seed({
      userId: 'u',
      taxYear: 2025,
      fields: { 'bruttolohn-total': '90000', 'ahv-beitraege': '6660', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as CrossBorderSalaryStatementRecord['fields'],
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      exchangeRateMonth: '2025-12',
      exchangeRateValue: 1.07,
      exchangeRateMode: 'amtlich',
      exchangeRateReceiptId: null,
      nGre: { familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 4500, pkArbeitgeberChf: 4500 } as unknown as CrossBorderSalaryStatementRecord['nGre'],
    })

    const status = range(await service.getState('u', 2025))

    expect(status.anrechnung).toBe(4334)
    expect(status.result.to).toBeLessThan(0)
  })

  it('names the missing Pensionskasse Obligatorium instead of guessing the Altersvorsorge', async () => {
    const { interview, ch, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, ausland: 'Ja, in die Schweiz', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' })
    ch.seed({
      userId: 'u',
      taxYear: 2025,
      fields: { 'bruttolohn-total': '90000', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as CrossBorderSalaryStatementRecord['fields'],
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      exchangeRateMonth: '2025-12',
      exchangeRateValue: 1.07,
      exchangeRateMode: 'amtlich',
      exchangeRateReceiptId: null,
      nGre: { pkArbeitnehmerChf: null } as CrossBorderSalaryStatementRecord['nGre'],
    })

    const status = await service.getState('u', 2025)

    expect(status).toEqual({ kind: 'offen', missing: ['pk-obligatorium'] })
  })

  it('widens only result.to by UNCERTAINTY_PER_ITEM for each AMOUNT_LATER answer in a single estimate', async () => {
    const base = setup()
    base.interview.seed('u', 2025, EMPLOYED)
    base.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    const baseline = range(await base.service.getState('u', 2025))
    expect(baseline.laterAmounts).toBeUndefined()

    const deferred = setup()
    deferred.interview.seed('u', 2025, { ...EMPLOYED, spenden: 'Ja', 'spenden-betrag': AMOUNT_LATER })
    deferred.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    const widened = range(await deferred.service.getState('u', 2025))

    expect(widened.result.from).toBe(baseline.result.from)
    expect(widened.result.to).toBe(baseline.result.to + UNCERTAINTY_PER_ITEM)
    expect(widened.taxableIncome).toEqual(baseline.taxableIncome)
    expect(widened.incomeTax).toEqual(baseline.incomeTax)
    expect(widened.laterAmounts).toBe(1)
  })

  it('sums AMOUNT_LATER answers from both spouses in a joint couple estimate', async () => {
    const setupCouple = async (aLater: boolean, bLater: boolean) => {
      const env = setup()
      env.interview.seed('a', 2025, aLater ? { ...EMPLOYED, spenden: 'Ja', 'spenden-betrag': AMOUNT_LATER } : EMPLOYED)
      env.interview.seed('spouse_a_2025', 2025, bLater ? { dhf: 'Nein', umzug: 'Ja', 'umzug-kosten': AMOUNT_LATER } : {})
      await env.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
      await env.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
      env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
      env.lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '10420', sozialversicherung: '10008' })
      return range(await env.service.getState('a', 2025))
    }

    const baseline = await setupCouple(false, false)
    const widened = await setupCouple(true, true)

    expect(baseline.laterAmounts).toBeUndefined()
    expect(widened.result.from).toBe(baseline.result.from)
    expect(widened.result.to).toBe(baseline.result.to + 2 * UNCERTAINTY_PER_ITEM)
    expect(widened.laterAmounts).toBe(2)
  })

  describe('§ 24b Entlastungsbetrag (#450 Teil 6)', () => {
    const single = { ...EMPLOYED, familienstand: 'Ledig', kinder: '2 oder mehr' }

    it('lowers the taxable income by 4.260 € + 240 € for the second child', async () => {
      const base = setup()
      base.interview.seed('u', 2025, { ...EMPLOYED, familienstand: 'Ledig' })
      base.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
      const without = range(await base.service.getState('u', 2025))

      const parent = setup()
      parent.interview.seed('u', 2025, single)
      parent.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
      const withRelief = range(await parent.service.getState('u', 2025))

      expect(without.taxableIncome.from - withRelief.taxableIncome.from).toBe(4260 + 240)
    })

    it('grants no relief when another adult lives in the household (§ 24b Abs. 3)', async () => {
      const base = setup()
      base.interview.seed('u', 2025, { ...EMPLOYED, familienstand: 'Ledig' })
      base.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
      const without = range(await base.service.getState('u', 2025))

      const shared = setup()
      shared.interview.seed('u', 2025, { ...single, 'ae-haushaltsgemeinschaft': 'Ja' })
      shared.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
      expect(range(await shared.service.getState('u', 2025)).taxableIncome).toEqual(without.taxableIncome)
    })
  })
})
