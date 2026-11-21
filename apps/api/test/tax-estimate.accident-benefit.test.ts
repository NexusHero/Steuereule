import { describe, expect, it } from 'vitest'
import { dailyBenefitEntry, type DailyBenefitSource } from '@steuereule/core'
import type { CommuteRepository } from '../src/commute/commute.repository.js'
import type { CrossBorderSalaryStatementRecord } from '../src/ch-salary-certificate/ch-salary-certificate.repository.js'
import type { MasterDataRecord } from '../src/master-data/master-data.repository.js'
import { TaxEstimateService, type TaxEstimateStatus } from '../src/tax-estimate/tax-estimate.service.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'

// The daily benefit of the Swiss accident insurance (UVG/SUVA) is tax-free like the sickness benefit of a
// collective insurance, so both leave the wage; only the accident benefit raises the tax rate (§ 32b EStG).

function range(status: TaxEstimateStatus) {
  if (status.kind !== 'spanne') throw new Error(`expected a range, got ${JSON.stringify(status)}`)
  return status
}

const NO_COMMUTE: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _y, e) => e }

function setup() {
  const lstb = new FakeLstbRepository()
  const interview = new FakeInterviewAnswerRepository()
  const ch = new FakeChSalaryCertificateRepository()
  const masterData = new FakeMasterDataRepository()
  const link = new FakeLinkRepository()
  const service = new TaxEstimateService(lstb, interview, ch, masterData, NO_COMMUTE, link, new FakeChildRepository(), new FakeRentalRepository(), new FakePensionRepository())
  return { lstb, interview, ch, masterData, link, service }
}

type Benefit = { steuerfreiesKrankentaggeldChf?: string; steuerfreiesUnfalltaggeldChf?: string }

/** 90.000 CHF gross at 1,07 with the usual deductions; the benefit is what the cases differ in. */
const certificate = (userId: string, benefit: Benefit): CrossBorderSalaryStatementRecord => ({
  userId,
  taxYear: 2025,
  fields: { 'bruttolohn-total': '90000', 'ahv-beitraege': '6660', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as CrossBorderSalaryStatementRecord['fields'],
  bemerkungen: null,
  saeule3aChf: null,
  krankenkasseChf: null,
  exchangeRateMonth: '2025-12',
  exchangeRateValue: 1.07,
  exchangeRateMode: 'amtlich',
  exchangeRateReceiptId: null,
  nGre: { familienzulagenChf: '0', krankentaggeldChf: '0', pkArbeitnehmerChf: '4500', pkArbeitgeberChf: '4500', ...benefit } as unknown as CrossBorderSalaryStatementRecord['nGre'],
})

const CROSS_BORDER = { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }
const BENEFIT_CHF = '6000'

describe('daily accident benefit (UVG/SUVA) in the estimate of a single cross-border commuter', () => {
  const single = async (benefit: Benefit, answers: Record<string, string> = {}) => {
    const env = setup()
    env.interview.seed('u', 2025, { job: 'Angestellt', kinder: 'Nein', ausland: 'Ja, in die Schweiz', ...CROSS_BORDER, ...answers })
    env.ch.seed(certificate('u', benefit))
    return range(await env.service.getState('u', 2025))
  }

  it('has the same taxable wage as the sickness benefit, but pays more tax (progression clause)', async () => {
    const sickness = await single({ steuerfreiesKrankentaggeldChf: BENEFIT_CHF })
    const accident = await single({ steuerfreiesUnfalltaggeldChf: BENEFIT_CHF })
    const without = await single({})

    // Both benefits leave the wage: the income after Werbungskosten and the zvE are the same.
    expect(accident.breakdown?.persons?.[0]?.incomeEur).toBe(sickness.breakdown?.persons?.[0]?.incomeEur)
    expect(accident.taxableIncome).toEqual(sickness.taxableIncome)
    expect(accident.taxableIncome.to).toBeLessThan(without.taxableIncome.to)
    // 6.000 CHF at 1,07 = 6.420 € under the progression clause: more tax on the same income.
    expect(accident.incomeTax.from).toBeGreaterThan(sickness.incomeTax.from)
    expect(accident.incomeTax.to).toBeGreaterThan(sickness.incomeTax.to)
    expect(accident.result.to).toBeLessThan(sickness.result.to)
    // Still less than taxing the benefit as wage.
    expect(accident.incomeTax.to).toBeLessThan(without.incomeTax.to)
    // Worked example, 2025 tariff: zvE 77.359–79.260 € in all three benefit cases with the deduction.
    // Sickness: 0,42 × 79.260 − 10.911,92 = 22.377 €. Accident: the rate of 79.260 + 6.420 = 85.680 €
    // (25.073 € ≙ 29,26 %) on 79.260 € = 23.194 €, 817 € more. As wage it would be 24.937 €.
    expect(accident.taxableIncome).toEqual({ from: 77359, to: 79260 })
    expect(sickness.incomeTax).toEqual({ from: 21578, to: 22377 })
    expect(accident.incomeTax).toEqual({ from: 22414, to: 23194 })
    expect(without.incomeTax).toEqual({ from: 24189, to: 24937 })
  })

  it('changes nothing with 0 or without the field', async () => {
    expect(await single({ steuerfreiesUnfalltaggeldChf: '0' })).toEqual(await single({}))
  })

  it('adds to the wage replacement benefits the interview names', async () => {
    const benefits = { lohnersatz: 'Ja', 'lohnersatz-betrag': '3000' }
    const both = await single({ steuerfreiesUnfalltaggeldChf: BENEFIT_CHF }, benefits)
    expect(both.incomeTax.to).toBeGreaterThan((await single({ steuerfreiesUnfalltaggeldChf: BENEFIT_CHF })).incomeTax.to)
    expect(both.incomeTax.to).toBeGreaterThan((await single({ steuerfreiesKrankentaggeldChf: BENEFIT_CHF }, benefits)).incomeTax.to)
  })
})

// The answer to „Woher kam das Taggeld?“ decides the field (ADR-0072, Punkt 5): stored as the mask and the
// owl store it, then estimated.
describe('the source of a daily benefit in the estimate', () => {
  const answered = (source: DailyBenefitSource, amountChf: number | null): Benefit => {
    const entry = dailyBenefitEntry(source, amountChf)
    const text = (value: number | null) => (value === null ? undefined : String(value))
    return Object.fromEntries(
      Object.entries({ steuerfreiesKrankentaggeldChf: text(entry.steuerfreiesKrankentaggeldChf), steuerfreiesUnfalltaggeldChf: text(entry.steuerfreiesUnfalltaggeldChf) }).filter(([, value]) => value !== undefined),
    ) as Benefit
  }
  const single = async (benefit: Benefit) => {
    const env = setup()
    env.interview.seed('u', 2025, { job: 'Angestellt', kinder: 'Nein', ausland: 'Ja, in die Schweiz', ...CROSS_BORDER })
    env.ch.seed(certificate('u', benefit))
    return range(await env.service.getState('u', 2025))
  }

  it('deducts nothing for the employer’s continued pay, even with an amount typed', async () => {
    const without = await single({})
    const continued = await single(answered('lohnfortzahlung', 6000))
    expect(continued.taxableIncome).toEqual(without.taxableIncome)
    expect(continued.incomeTax).toEqual(without.incomeTax)
    expect(await single(answered('kein', null))).toEqual(continued)
  })

  it('deducts an insurance benefit without the progression clause', async () => {
    const insurance = await single(answered('krankentaggeldversicherung', 6000))
    expect(insurance).toEqual(await single({ steuerfreiesKrankentaggeldChf: BENEFIT_CHF }))
    expect(insurance.breakdown?.progressionIncomeEur).toBeUndefined()
    expect(insurance.taxableIncome.to).toBeLessThan((await single({})).taxableIncome.to)
  })

  it('deducts only the insurer’s part for „beides“: the top-up stays wage', async () => {
    const insurerPart = await single(answered('beides', 4800))
    const whole = await single(answered('krankentaggeldversicherung', 6000))
    expect(insurerPart.taxableIncome.to).toBeGreaterThan(whole.taxableIncome.to)
    expect(insurerPart.taxableIncome.to).toBeLessThan((await single({})).taxableIncome.to)
  })

  it('deducts an accident benefit with the progression clause', async () => {
    const accident = await single(answered('unfallversicherung', 6000))
    const insurance = await single(answered('krankentaggeldversicherung', 6000))
    expect(accident.taxableIncome).toEqual(insurance.taxableIncome)
    // 6.000 CHF at 1,07.
    expect(accident.breakdown?.progressionIncomeEur).toBe(6420)
    expect(accident.incomeTax.to).toBeGreaterThan(insurance.incomeTax.to)
  })
})

describe('daily accident benefit (UVG/SUVA) in the estimate of a couple', () => {
  const couple = async (a: Benefit | null, b: Benefit | null) => {
    const env = setup()
    env.interview.seed('a', 2025, { job: 'Angestellt', kinder: 'Nein', ausland: a ? 'Ja, in die Schweiz' : 'Nein', ...(a ? CROSS_BORDER : {}) })
    env.interview.seed('spouse_a_2025', 2025, b ? CROSS_BORDER : {})
    await env.masterData.save('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await env.link.upsert('a', 2025, { personBUserId: 'spouse_a_2025', filingType: 'zusammen' })
    if (a) env.ch.seed(certificate('a', a))
    else env.lstb.seed({ userId: 'a', taxYear: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
    if (b) env.ch.seed(certificate('spouse_a_2025', b))
    else env.lstb.seed({ userId: 'spouse_a_2025', taxYear: 2025, bruttoarbeitslohn: '21000', lohnsteuer: '2150', sozialversicherung: '4263' })
    return range(await env.service.getState('a', 2025))
  }

  it('counts Person A’s accident benefit under the progression clause, on the same taxable income as a sickness benefit', async () => {
    const sickness = await couple({ steuerfreiesKrankentaggeldChf: BENEFIT_CHF }, null)
    const accident = await couple({ steuerfreiesUnfalltaggeldChf: BENEFIT_CHF }, null)
    expect(accident.taxableIncome).toEqual(sickness.taxableIncome)
    expect(accident.incomeTax.to).toBeGreaterThan(sickness.incomeTax.to)
    expect(await couple({ steuerfreiesUnfalltaggeldChf: '0' }, null)).toEqual(await couple({}, null))
  })

  it('counts Person B’s accident benefit as well, and both persons’ together', async () => {
    const sickness = await couple(null, { steuerfreiesKrankentaggeldChf: BENEFIT_CHF })
    const accident = await couple(null, { steuerfreiesUnfalltaggeldChf: BENEFIT_CHF })
    expect(accident.taxableIncome).toEqual(sickness.taxableIncome)
    expect(accident.incomeTax.to).toBeGreaterThan(sickness.incomeTax.to)

    const onlyA = await couple({ steuerfreiesUnfalltaggeldChf: BENEFIT_CHF }, { steuerfreiesKrankentaggeldChf: BENEFIT_CHF })
    const both = await couple({ steuerfreiesUnfalltaggeldChf: BENEFIT_CHF }, { steuerfreiesUnfalltaggeldChf: BENEFIT_CHF })
    expect(both.taxableIncome).toEqual(onlyA.taxableIncome)
    expect(both.incomeTax.to).toBeGreaterThan(onlyA.incomeTax.to)
  })
})
