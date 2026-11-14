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
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
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
  const pension = new FakePensionRepository()
  const service = new TaxEstimateService(lstb, interview, ch, masterData, commute(path), link, kinder, rental, pension)
  return { lstb, interview, ch, stammdaten: masterData, kopplung: link, kinder, vermietung: rental, pension, service }
}

const EMPLOYED = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' }

describe('estimate coverage from the UX review (K3)', () => {
  it('estimates a single pensioner from the recorded pension instead of declining', async () => {
    const { interview, pension, service } = setup()
    interview.seed('u', 2025, { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verwitwet' })
    pension.seed({ userId: 'u', taxYear: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '18000', rentenbeginnJahr: '2019', alterBeiRentenbeginn: null })

    const status = range(await service.getState('u', 2025))

    expect(status.anrechnung).toBe(0)
    expect(status.result.to).toBeLessThanOrEqual(0)
  })

  it('asks for the pension before it estimates a pensioner', async () => {
    const { interview, service } = setup()
    interview.seed('u', 2025, { job: 'Rente', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    expect(await service.getState('u', 2025)).toEqual({ kind: 'offen', missing: ['rente'] })
  })

  it('keeps the range with wage replacement benefits and prices them under § 32b', async () => {
    const { lstb, interview, service } = setup()
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '7100', sozialversicherung: '9850' })
    interview.seed('u', 2025, EMPLOYED)
    const without = range(await service.getState('u', 2025))
    interview.seed('u', 2025, { ...EMPLOYED, lohnersatz: 'Ja', 'lohnersatz-betrag': '3000' })
    const withBenefits = range(await service.getState('u', 2025))

    expect(withBenefits.result.to).toBeLessThan(without.result.to)
  })

  it('asks for the amount when wage replacement is answered „Ja“ without one', async () => {
    const { lstb, interview, service } = setup()
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '7100', sozialversicherung: '9850' })
    interview.seed('u', 2025, { ...EMPLOYED, lohnersatz: 'Ja' })
    expect(await service.getState('u', 2025)).toEqual({ kind: 'offen', missing: ['lohnersatz-betrag'] })
  })
})

describe('SteuerschaetzungService', () => {
  it('estimates the refund for a complete Lohnsteuerbescheinigung', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, EMPLOYED)
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    const status = range(await service.getState('u', 2025))

    expect(status.result.from).toBeGreaterThan(0)
    expect(status.result.from).toBeLessThan(status.result.to)
  })

  it('credits the prepayments of the year against the tax (§ 37 EStG, ADR-0081)', async () => {
    const { lstb, interview, service } = setup()
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    interview.seed('u', 2025, EMPLOYED)
    const without = range(await service.getState('u', 2025))
    interview.seed('u', 2025, { ...EMPLOYED, 'vorauszahlungen-gate': 'Ja', 'vorauszahlungen-betrag': '2400' })
    const withPrepayments = range(await service.getState('u', 2025))

    expect(withPrepayments.result).toEqual({ from: without.result.from + 2400, to: without.result.to + 2400 })
    expect(withPrepayments).toMatchObject({ prepayments: 2400 })
  })

  it('ignores a prepayment amount behind a „Nein“', async () => {
    const { lstb, interview, service } = setup()
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    interview.seed('u', 2025, { ...EMPLOYED, 'vorauszahlungen-gate': 'Nein', 'vorauszahlungen-betrag': '2400' })
    expect(range(await service.getState('u', 2025))).not.toHaveProperty('prepayments')
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

  it('adds the further Werbungskosten from the commute mask (ADR-0076)', async () => {
    const path: CommuteInputs = { workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 20, oneWayKm: 30, transport: 'pkw', workplace: null }
    const { lstb, interview, service } = setup({ ...path, professionalBodiesEur: 120, workEquipmentEur: 110, accountFeesEur: 16, otherWorkExpensesEur: 40 })
    interview.seed('u', 2025, EMPLOYED)
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    expect(range(await service.getState('u', 2025)).werbungskosten).toBe(2019 + 120 + 120 + 110 + 16 + 40)
  })

  it('counts childcare as a Sonderausgabe: 80 %, at most 4.800 € per child (ADR-0076)', async () => {
    const { lstb, interview, kinder, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, kinder: '1' })
    lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    const child = await kinder.create('u', 2025, { firstName: 'Mia', lastName: 'Muster', geburtsdatum: '2021-03-14' } as never)
    const without = range(await service.getState('u', 2025))
    await kinder.update('u', 2025, child.id, { childcareEur: '1000' })

    const withCare = range(await service.getState('u', 2025))
    expect(withCare.specialExpenses).toBe(800)
    // result is the refund: 800 € more Sonderausgaben raise it.
    expect(withCare.result.to).toBeGreaterThan(without.result.to)
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

  it('counts Person B’s Swiss wage next to B’s German one when B recorded the Grenzgänger questions (escalation case)', async () => {
    const swiss = (userId: string): CrossBorderSalaryStatementRecord => ({
      userId,
      taxYear: 2025,
      fields: { 'bruttolohn-total': '31200', 'ahv-beitraege': '1997', 'berufliche-vorsorge': '1450', quellensteuer: '1404' } as CrossBorderSalaryStatementRecord['fields'],
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      exchangeRateMonth: '2025',
      exchangeRateValue: 1.065,
      exchangeRateMode: 'jahresdurchschnitt',
      exchangeRateReceiptId: null,
      nGre: { familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 1100, pkArbeitgeberChf: 1100 } as unknown as CrossBorderSalaryStatementRecord['nGre'],
    })
    const couple = async (bAnswers: Record<string, string>) => {
      const env = setup()
      env.interview.seed('a', 2025, EMPLOYED)
      env.interview.seed('spouse_a_2025', 2025, bAnswers)
      await env.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
      await env.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
      env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
      env.lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '21000', lohnsteuer: '2150', sozialversicherung: '4263' })
      env.ch.seed(swiss('spouse_a_2025'))
      return range(await env.service.getState('a', 2025))
    }
    const withSwiss = await couple({ 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' })
    // Both wage taxes and B's Quellensteuer (1.404 CHF at 1,065) are credited.
    expect(withSwiss.anrechnung).toBe(9890 + 2150 + Math.round(1404 * 1.065))
    const germanOnly = await couple({})
    expect(withSwiss.incomeTax.from).toBeGreaterThan(germanOnly.incomeTax.from)
  })

  it('counts Person B’s pension in the couple’s estimate instead of leaving B out (ADR-0088)', async () => {
    const couple = async (withPension: boolean) => {
      const env = setup()
      env.interview.seed('a', 2025, EMPLOYED)
      await env.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
      await env.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
      env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '60000', lohnsteuer: '9000', sozialversicherung: '12000' })
      if (withPension) env.pension.seed({ userId: 'spouse_a_2025', taxYear: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '18000', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })
      return range(await env.service.getState('a', 2025))
    }
    // 18.000 € at the 80 % taxable share of a 2020 start = 14.400 €, less the 102 € lump sum.
    expect((await couple(true)).taxableIncome.from - (await couple(false)).taxableIncome.from).toBe(14_298)
  })

  it('asks for the pension’s start when B’s pension is entered but incomplete', async () => {
    const env = setup()
    env.interview.seed('a', 2025, EMPLOYED)
    await env.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await env.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
    env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '60000', lohnsteuer: '9000', sozialversicherung: '12000' })
    env.pension.seed({ userId: 'spouse_a_2025', taxYear: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '18000', rentenbeginnJahr: null, alterBeiRentenbeginn: null })
    expect(await env.service.getState('a', 2025)).toEqual({ kind: 'offen', missing: ['personB.rente'] })
  })

  it('does not tax a Swiss wage that is exempt: no Grenzgänger (> 60 days without return) gets no estimate (ADR-0088)', async () => {
    const seed = (env: ReturnType<typeof setup>, userId: string, days: string) => {
      env.ch.seed({
        userId, taxYear: 2025,
        fields: { 'bruttolohn-total': '90000', 'ahv-beitraege': '6660', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as CrossBorderSalaryStatementRecord['fields'],
        bemerkungen: null, saeule3aChf: null, krankenkasseChf: null,
        exchangeRateMonth: '2025', exchangeRateValue: 1.065, exchangeRateMode: 'jahresdurchschnitt', exchangeRateReceiptId: null,
        nGre: { familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 4500, pkArbeitgeberChf: 4500 } as unknown as CrossBorderSalaryStatementRecord['nGre'],
      })
      return { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': days }
    }
    const single = setup()
    single.interview.seed('u', 2025, { ...EMPLOYED, ausland: 'Ja, in die Schweiz', ...seed(single, 'u', '75') })
    expect(await single.service.getState('u', 2025)).toEqual({ kind: 'nicht-moeglich', reason: 'kein-grenzgaenger' })

    const couple = setup()
    couple.interview.seed('a', 2025, EMPLOYED)
    couple.interview.seed('spouse_a_2025', 2025, seed(couple, 'spouse_a_2025', '75'))
    await couple.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await couple.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
    couple.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '60000', lohnsteuer: '9000', sozialversicherung: '12000' })
    expect(await couple.service.getState('a', 2025)).toEqual({ kind: 'nicht-moeglich', reason: 'kein-grenzgaenger' })
  })

  it('measures the reasonable burden with three recorded children at 1/1/2 % (§ 33 Abs. 3 EStG, BMF check 14.11.2026)', async () => {
    // GdE 146.289 €, joint, 3 children: reasonable burden 2.414,48 € (with 1-2 children it would be 5.186,86 €).
    const estimate = async (children: number) => {
      const env = setup()
      env.interview.seed('a', 2025, { ...EMPLOYED, kinder: '2 oder mehr', 'gesundheit-gate': 'Ja', 'gesundheit-betrag': '4000' })
      await env.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
      await env.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
      env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '98749', lohnsteuer: '20000', sozialversicherung: '0' })
      env.lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '0' })
      for (let i = 0; i < children; i++) await env.kinder.create('a', 2025, { firstName: `K${i}`, lastName: 'M', geburtsdatum: '2015-01-01' })
      return range(await env.service.getState('a', 2025))
    }
    const three = await estimate(3)
    const none = await (async () => {
      const env = setup()
      env.interview.seed('a', 2025, { ...EMPLOYED, kinder: '2 oder mehr' })
      await env.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
      await env.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
      env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '98749', lohnsteuer: '20000', sozialversicherung: '0' })
      env.lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '50000', lohnsteuer: '8000', sozialversicherung: '0' })
      for (let i = 0; i < 3; i++) await env.kinder.create('a', 2025, { firstName: `K${i}`, lastName: 'M', geburtsdatum: '2015-01-01' })
      return range(await env.service.getState('a', 2025))
    })()
    // 4.000 € − 2.414,48 € = 1.585,52 € less taxable income.
    expect(none.taxableIncome.from - three.taxableIncome.from).toBe(1586)
  })

  it('adds a German employer’s certificate of the same year to a Grenzgänger’s Swiss wage (change of job, ADR-0079)', async () => {
    const seed = (env: ReturnType<typeof setup>) => {
      env.interview.seed('u', 2025, { ...EMPLOYED, ausland: 'Ja, in die Schweiz', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' })
      env.ch.seed({
        userId: 'u',
        taxYear: 2025,
        fields: { 'bruttolohn-total': '20000', 'ahv-beitraege': '1480', 'berufliche-vorsorge': '1200', quellensteuer: '900' } as CrossBorderSalaryStatementRecord['fields'],
        bemerkungen: null,
        saeule3aChf: null,
        krankenkasseChf: null,
        exchangeRateMonth: '2025',
        exchangeRateValue: 1.065,
        exchangeRateMode: 'jahresdurchschnitt',
        exchangeRateReceiptId: null,
        nGre: { familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 470, pkArbeitgeberChf: 470 } as unknown as CrossBorderSalaryStatementRecord['nGre'],
      })
    }
    const swissOnly = setup()
    seed(swissOnly)
    const both = setup()
    seed(both)
    both.lstb.seed({ userId: 'u', taxYear: 2025, bruttoarbeitslohn: '70000', lohnsteuer: '15000', sozialversicherung: '14000' })

    const a = range(await swissOnly.service.getState('u', 2025))
    const b = range(await both.service.getState('u', 2025))
    expect(b.anrechnung).toBe(a.anrechnung + 15000)
    expect(b.taxableIncome.from).toBeGreaterThan(a.taxableIncome.from + 50000)
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

  it('counts stated training costs as Werbungskosten, and nothing for a bare „Ja“ (#476)', async () => {
    const estimateWith = async (answers: Record<string, string>) => {
      const env = setup()
      // Relocation costs lift the employee above the Pauschbetrag, so every further euro shows.
      env.interview.seed('a', 2025, { ...EMPLOYED, umzug: 'Ja', 'umzug-kosten': '2000', ...answers })
      env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '62000', lohnsteuer: '11800', sozialversicherung: '12400' })
      return range(await env.service.getState('a', 2025))
    }

    const without = await estimateWith({})
    const yesOnly = await estimateWith({ fortbildung: 'Ja' })
    const withCosts = await estimateWith({ fortbildung: 'Ja', 'fortbildung-kosten': '850' })
    const deniedButAmountLeft = await estimateWith({ fortbildung: 'Nein', 'fortbildung-kosten': '850' })

    expect(yesOnly.werbungskosten).toBe(without.werbungskosten)
    expect(withCosts.werbungskosten).toBe(without.werbungskosten + 850)
    expect(withCosts.result.from).toBeGreaterThan(without.result.from)
    expect(deniedButAmountLeft.werbungskosten).toBe(without.werbungskosten)
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

describe('Kirchensteuer in the estimate (#450 Teil 6F, ADR-0063)', () => {
  const LSTB = { userId: 'u', taxYear: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' }

  it('single in Berlin, evangelisch: 9 % due, the LStB church tax credited, and churchTaxOpen is false', async () => {
    const { lstb, interview, stammdaten, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, familienstand: 'Ledig' })
    await stammdaten.save('u', { familienstand: 'ledig', religion: 'EV', plz: '10115' } as MasterDataRecord)
    lstb.seed({ ...LSTB, kirchensteuer: '540' })

    const status = range(await service.getState('u', 2025))

    expect(status.churchTaxOpen).toBe(false)
    if (status.churchTax?.kind !== 'spanne') throw new Error('expected church tax')
    expect(status.churchTax.withheld).toBe(540)
    expect(status.churchTax.due.to).toBe(Math.floor(status.incomeTax.to * 0.09))
    expect(status.specialExpenses).toBe(540)
  })

  it('single in München, katholisch: 8 %', async () => {
    const { lstb, interview, stammdaten, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, familienstand: 'Ledig' })
    await stammdaten.save('u', { familienstand: 'ledig', religion: 'RK', plz: '80331' } as MasterDataRecord)
    lstb.seed({ ...LSTB, kirchensteuer: '480' })

    const status = range(await service.getState('u', 2025))

    if (status.churchTax?.kind !== 'spanne') throw new Error('expected church tax')
    expect(status.churchTax.due.to).toBe(Math.floor(status.incomeTax.to * 0.08))
  })

  it('no church: no church tax and no hint', async () => {
    const { lstb, interview, stammdaten, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, familienstand: 'Ledig' })
    await stammdaten.save('u', { familienstand: 'ledig', religion: 'VD', plz: '10115' } as MasterDataRecord)
    lstb.seed(LSTB)

    const status = range(await service.getState('u', 2025))

    expect(status.churchTax).toEqual({ kind: 'none' })
    expect(status.churchTaxOpen).toBe(false)
  })

  it('confession not entered: honest "offen", never a silent 0 €', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, { ...EMPLOYED, familienstand: 'Ledig' })
    lstb.seed(LSTB)

    const status = range(await service.getState('u', 2025))

    expect(status.churchTax).toEqual({ kind: 'offen', reason: 'konfession-fehlt' })
    expect(status.churchTaxOpen).toBe(true)
  })

  it('married, one spouse without a church (glaubensverschieden): church tax only on the member side', async () => {
    const env = setup()
    env.interview.seed('a', 2025, EMPLOYED)
    env.interview.seed('spouse_a_2025', 2025, {})
    await env.stammdaten.save('a', { familienstand: 'verheiratet', religion: 'EV', plz: '01067' } as MasterDataRecord)
    await env.stammdaten.save('spouse_a_2025', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await env.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
    env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473', kirchensteuer: '890' })
    env.lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '10420', sozialversicherung: '10008' })

    const status = range(await env.service.getState('a', 2025))

    if (status.churchTax?.kind !== 'spanne') throw new Error('expected church tax')
    expect(status.churchTax.withheld).toBe(890)
    // Less than 9 % of the whole joint tax: only A's share counts (or the Kirchgeld, if higher).
    expect(status.churchTax.due.to).toBeLessThan(Math.floor(status.incomeTax.to * 0.09))
    expect(status.churchTax.due.to).toBeGreaterThan(0)
  })
})
