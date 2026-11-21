// Fast, no-DB unit tier (ADR-0004): KapitalService against FakeKapitalRepository +
// FakeInterviewAnswerRepository + FakeLstbRepository + FakeTaxYearRepository + FakeAuditRepository.
// Mirrors rente.service.test.ts. The full real-Postgres proof (ciphertext at rest, audit
// atomicity, cross-user isolation, the real fold through Prisma) lives in
// test/acceptance/req-025-kapital.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { CapitalService } from '../src/capital/capital.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'
import type { CommuteRepository } from '../src/commute/commute.repository.js'
import type { CrossBorderSalaryStatementRecord } from '../src/ch-salary-certificate/ch-salary-certificate.repository.js'
import type { MasterDataRecord } from '../src/master-data/master-data.repository.js'
import { incomeTax, soliExemptionLimits, solidaritaetszuschlag, solidaritaetszuschlagInCents, splittingTariff } from '@steuereule/core'

const USER_ID = 'user-1'
const TAX_YEAR = 2026
const NO_COMMUTE: CommuteRepository = { findForUserAndYear: async () => null, save: async (_u, _y, e) => e }

/** A Swiss Lohnausweis at 1,07 with the usual deductions (made-up figures). */
const swissCertificate = (userId: string, grossChf: string, withholdingChf: string): CrossBorderSalaryStatementRecord => ({
  userId,
  taxYear: 2025,
  fields: { 'bruttolohn-total': grossChf, 'ahv-beitraege': String(Math.round(Number(grossChf) * 0.074)), 'berufliche-vorsorge': '4500', quellensteuer: withholdingChf } as CrossBorderSalaryStatementRecord['fields'],
  bemerkungen: null,
  saeule3aChf: null,
  krankenkasseChf: null,
  exchangeRateMonth: '2025-12',
  exchangeRateValue: 1.07,
  exchangeRateMode: 'amtlich',
  exchangeRateReceiptId: null,
  nGre: { familienzulagenChf: '0', krankentaggeldChf: '0', pkArbeitnehmerChf: '4500', pkArbeitgeberChf: '4500' } as unknown as CrossBorderSalaryStatementRecord['nGre'],
})

describe('KapitalService', () => {
  let markings: FakeMarkingRepository
  let repository: FakeCapitalRepository
  let interviewRepository: FakeInterviewAnswerRepository
  let lstbRepository: FakeLstbRepository
  let taxYearRepository: FakeTaxYearRepository
  let auditRepository: FakeAuditRepository
  let ch: FakeChSalaryCertificateRepository
  let masterData: FakeMasterDataRepository
  let link: FakeLinkRepository
  let pension: FakePensionRepository
  let estimates: TaxEstimateService
  let service: CapitalService

  beforeEach(() => {
    repository = new FakeCapitalRepository()
    interviewRepository = new FakeInterviewAnswerRepository()
    lstbRepository = new FakeLstbRepository()
    taxYearRepository = new FakeTaxYearRepository()
    auditRepository = new FakeAuditRepository()
    markings = new FakeMarkingRepository()
    ch = new FakeChSalaryCertificateRepository()
    masterData = new FakeMasterDataRepository()
    link = new FakeLinkRepository()
    pension = new FakePensionRepository()
    // The Cockpit estimate over the same records: the mask compares on its figures.
    estimates = new TaxEstimateService(lstbRepository, interviewRepository, ch, masterData, NO_COMMUTE, link, new FakeChildRepository(), new FakeRentalRepository(), pension, repository)
    service = new CapitalService(repository, interviewRepository, taxYearRepository, new AuditService(auditRepository), markings, estimates)
  })

  describe('getState — the honest empty mask and the depot-Einordnung', () => {
    it('a fresh tax year returns the field offen, depot unbekannt, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, TAX_YEAR)

      expect(state.kapitalertraege).toEqual({ kind: 'offen' })
      expect(state.depot).toEqual({ kind: 'unbekannt' })
      expect(state.items).toEqual([])
      expect(state.status).toMatchObject({ kind: 'offen', einnahmen: 0, openItems: 1 })
      expect(auditRepository.all()).toEqual([])
    })

    it('derives the depot-Einordnung from the stored kap-depot answer — never a column of its own', async () => {
      interviewRepository.seed(USER_ID, TAX_YEAR, { 'kap-depot': 'Ausländischer Broker' })

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.depot).toEqual({ kind: 'auslaendischer-broker' })
    })

    it('re-entry reflects stored facts and appends a READ audit entry', async () => {
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, kapitalertraege: '2500' })
      interviewRepository.seed(USER_ID, TAX_YEAR, { 'kap-depot': 'Deutscher Broker' })

      const state = await service.getState(USER_ID, TAX_YEAR)

      expect(state.kapitalertraege).toEqual({ kind: 'erfasst', value: 2500 })
      expect(state.depot).toEqual({ kind: 'deutscher-broker' })
      expect(state.items).toEqual([{ id: 'kapital', amount: 2500, provenance: 'eingabe' }])
      expect(state.status).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'kapital' }])
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      repository.seed({ userId: 'someone-else', taxYear: TAX_YEAR, kapitalertraege: '1' })

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.kapitalertraege).toEqual({ kind: 'offen' })
    })
  })

  describe('setFeld — the guided mask', () => {
    it('captures the Kapitalerträge and folds them through the core', async () => {
      const state = await service.setField(USER_ID, TAX_YEAR, 'kapitalertraege', { kind: 'erfasst', value: 2500 })

      expect(state.kapitalertraege).toEqual({ kind: 'erfasst', value: 2500 })
      expect(state.items).toEqual([{ id: 'kapital', amount: 2500, provenance: 'eingabe' }])
      expect(state.status).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })
    })

    it('accepts unklar — the field stays honestly unreadable, the fold stays offen', async () => {
      const state = await service.setField(USER_ID, TAX_YEAR, 'kapitalertraege', { kind: 'unklar' })

      expect(state.kapitalertraege).toEqual({ kind: 'unklar' })
      expect(state.items).toEqual([])
      expect(state.status).toMatchObject({ kind: 'offen', openItems: 1 })
    })

    it('rejects an erfasst without a valid amount (400)', async () => {
      await expect(service.setField(USER_ID, TAX_YEAR, 'kapitalertraege', { kind: 'erfasst' })).rejects.toThrow('requires a non-negative integer')
      await expect(service.setField(USER_ID, TAX_YEAR, 'kapitalertraege', { kind: 'erfasst', value: -1 })).rejects.toThrow('requires a non-negative integer')
    })

    it('a Krypto-Anleger reads offen with the gate named (ADR-032)', async () => {
      interviewRepository.seed(USER_ID, TAX_YEAR, { einkuenfte: 'Kapitalerträge', 'kap-depot': 'Krypto' })

      const state = await service.setField(USER_ID, TAX_YEAR, 'kapitalertraege', { kind: 'erfasst', value: 2500 })

      expect(state.depot).toEqual({ kind: 'krypto' })
      expect(state.status).toMatchObject({ kind: 'offen', gated: ['Kapital'] })
    })
  })

  describe('getGuenstigerpruefung — § 32d Abs. 6 on the figures of the Cockpit estimate', () => {
    const YEAR = 2025
    const BROKER = { 'kap-depot': 'Deutscher Broker' }
    function seedTaxYear(userId = USER_ID): void {
      taxYearRepository.seed(userId, { taxYear: YEAR, openItems: 0 })
    }
    async function estimateOf(userId = USER_ID) {
      const status = await estimates.getState(userId, YEAR)
      if (status.kind !== 'spanne') throw new Error(`expected an estimate, got ${JSON.stringify(status)}`)
      return status
    }

    it('returns null when no tax year is seeded (the honest empty state)', async () => {
      const result = await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)
      expect(result).toBeNull()
    })

    it('a single employee with a German wage: basic tariff on the estimate’s taxable income, the flat tax wins', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, YEAR, { ...BROKER, job: 'Angestellt', familienstand: 'Ledig', kinder: 'Nein', ausland: 'Nein', lohnersatz: 'Nein' })
      lstbRepository.seed({ userId: USER_ID, taxYear: YEAR, bruttoarbeitslohn: '60000', lohnsteuer: '9500', sozialversicherung: '12000' })

      const result = await service.getMostFavourableCheck(USER_ID, YEAR, 0)
      const estimate = await estimateOf()

      expect(result?.kind).toBe('eindeutig')
      if (result?.kind === 'eindeutig') expect(result.recommendation).toBe('abgeltung')
      // 19.000 € × 25 % = 4.750 € plus 5,5 % Soli.
      expect(result?.flatRateTax).toBe(5011.25)
      // The other income is the estimate's, and so is the tariff on it.
      expect(result?.provenance).toEqual({
        kapitalertraege: 20000,
        remainingZvE: estimate.taxableIncome.to,
        remainingZvEFrom: estimate.taxableIncome.from,
        saversAllowance: 1000,
        assessmentType: 'einzel',
        components: ['einkommensteuer', 'solidaritaetszuschlag'],
      })
      expect(incomeTax(estimate.taxableIncome.to, YEAR)).toBe(estimate.breakdown?.tariffTax.to)
      const withCapital = incomeTax(estimate.taxableIncome.to + 19000, YEAR)
      const limit = soliExemptionLimits(YEAR).single
      expect(result?.personal).toBe(withCapital - estimate.breakdown!.tariffTax.to + solidaritaetszuschlag(withCapital, limit) - solidaritaetszuschlag(estimate.breakdown!.tariffTax.to, limit))
      expect(result?.delta).toBe(Math.round((result!.personal! - 5011.25) * 100) / 100)
      // The withheld flat tax is final; the single estimate does not carry the capital income.
      expect(result?.estimateTreatment).toBe('quelle')
    })

    it('a married couple, both with Swiss wages, joint: splitting tariff over the couple’s taxable income', async () => {
      const crossBorder = { 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' }
      seedTaxYear('a')
      repository.seed({ userId: 'a', taxYear: YEAR, kapitalertraege: '9000' })
      interviewRepository.seed('a', YEAR, { ...BROKER, ...crossBorder, job: 'Angestellt', familienstand: 'Verheiratet', kinder: 'Nein', ausland: 'Ja, in die Schweiz' })
      interviewRepository.seed('b', YEAR, crossBorder)
      await masterData.save('a', { familienstand: 'verheiratet' } as MasterDataRecord)
      await link.upsert('a', YEAR, { personBUserId: 'b', filingType: 'zusammen' })
      ch.seed(swissCertificate('a', '90000', '4050'))
      ch.seed(swissCertificate('b', '60000', '2700'))

      const result = await service.getMostFavourableCheck('a', YEAR, 0)
      const estimate = await estimateOf('a')

      expect(estimate.jointAssessment).toBe(true)
      expect(result?.provenance).toMatchObject({ assessmentType: 'zusammen', saversAllowance: 2000, remainingZvE: estimate.taxableIncome.to, remainingZvEFrom: estimate.taxableIncome.from })
      expect(splittingTariff(estimate.taxableIncome.to, 0, YEAR)).toBe(estimate.breakdown?.tariffTax.to)
      // The flat tax is the one the estimate charges: 7.000 € × 25 % = 1.750 € plus 96,25 € Soli.
      expect(estimate.breakdown?.capitalFlatTaxEur).toBe(1750)
      expect(result?.flatRateTax).toBe(1846.25)
      const withCapital = splittingTariff(estimate.taxableIncome.to + 7000, 0, YEAR)
      const limit = soliExemptionLimits(YEAR).joint
      const without = estimate.breakdown!.tariffTax.to
      expect(result?.personal).toBe(withCapital - without + (solidaritaetszuschlagInCents(withCapital, limit) - solidaritaetszuschlagInCents(without, limit)) / 100)
      expect(result?.estimateTreatment).toBe('abgeltung')
    })

    it('a pensioner: the taxable share of the pension is the other income', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: '5000' })
      interviewRepository.seed(USER_ID, YEAR, { ...BROKER, job: 'Rente', familienstand: 'Ledig', kinder: 'Nein', ausland: 'Nein' })
      pension.seed({ userId: USER_ID, taxYear: YEAR, rentenart: 'GesetzlicheRente', jahresbetrag: '24000', rentenbeginnJahr: '2019', alterBeiRentenbeginn: null })

      const result = await service.getMostFavourableCheck(USER_ID, YEAR, 0)
      const estimate = await estimateOf()

      expect(result?.provenance).toMatchObject({ assessmentType: 'einzel', saversAllowance: 1000, remainingZvE: estimate.taxableIncome.to })
      expect(estimate.taxableIncome.to).toBeGreaterThan(0)
      expect(incomeTax(estimate.taxableIncome.to, YEAR)).toBe(estimate.breakdown?.tariffTax.to)
      expect(result?.flatRateTax).toBe(1055)
      expect(result?.kind).toBe('eindeutig')
      if (result?.kind === 'eindeutig') expect(result.recommendation).toBe('persoenlich')
    })

    it('a low income: the tariff wins, the difference is the flat tax saved', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: '4000' })
      interviewRepository.seed(USER_ID, YEAR, { ...BROKER, job: 'Angestellt', familienstand: 'Ledig', kinder: 'Nein', ausland: 'Nein', lohnersatz: 'Nein' })
      lstbRepository.seed({ userId: USER_ID, taxYear: YEAR, bruttoarbeitslohn: '9000', lohnsteuer: '0', sozialversicherung: '1800' })

      const result = await service.getMostFavourableCheck(USER_ID, YEAR, 0)

      // 3.000 € on a taxable income far below the Grundfreibetrag: no tariff tax, 791,25 € flat tax saved.
      expect(result).toMatchObject({ kind: 'eindeutig', recommendation: 'persoenlich', flatRateTax: 791.25, personal: 0, delta: -791.25 })
    })

    it('where the estimate lacks inputs, it names the estimate’s own missing list instead of a number', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, YEAR, { ...BROKER, job: 'Angestellt', familienstand: 'Ledig', kinder: 'Nein', ausland: 'Nein', lohnersatz: 'Nein' })

      const estimate = await estimates.getState(USER_ID, YEAR)
      expect(estimate.kind).toBe('offen')
      const result = await service.getMostFavourableCheck(USER_ID, YEAR, 0)
      expect(result).toEqual({ kind: 'nicht-anwendbar', reason: 'schaetzung-offen', missing: estimate.kind === 'offen' ? [...estimate.missing] : [] })

      // A married person without the joint return set up: the filing type is what is missing.
      interviewRepository.seed(USER_ID, YEAR, { ...BROKER, job: 'Angestellt', familienstand: 'Verheiratet', kinder: 'Nein', ausland: 'Nein' })
      expect(await service.getMostFavourableCheck(USER_ID, YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'schaetzung-offen', missing: ['veranlagungsart'] })
    })

    it('where the estimate cannot price the case, it says so with the estimate’s reason', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, YEAR, BROKER)

      expect(await service.getMostFavourableCheck(USER_ID, YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'schaetzung-nicht-moeglich', estimateReason: 'nur-angestellte' })
    })

    it('a foreign broker withheld no Abgeltungsteuer — KAP-Pflicht, never a guessed comparison', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, YEAR, { 'kap-depot': 'Ausländischer Broker' })

      const result = await service.getMostFavourableCheck(USER_ID, YEAR, 0)

      expect(result).toEqual({ kind: 'nicht-anwendbar', reason: 'keine-abgeltung-einbehalten' })
    })

    it('Krypto is gated, an unanswered kap-depot is never guessed, missing Kapitalerträge are named', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, YEAR, { 'kap-depot': 'Krypto' })
      expect(await service.getMostFavourableCheck(USER_ID, YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'krypto-gegated' })

      interviewRepository.seed(USER_ID, YEAR, { 'kap-depot': 'irgendwas-anders' })
      expect(await service.getMostFavourableCheck(USER_ID, YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'kap-depot-nicht-beantwortet' })

      interviewRepository.seed(USER_ID, YEAR, { 'kap-depot': 'Deutscher Broker' })
      repository.seed({ userId: USER_ID, taxYear: YEAR, kapitalertraege: null })
      expect(await service.getMostFavourableCheck(USER_ID, YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'keine-kapitalertraege' })
    })
  })

  it('ADR-0052 §6: a user write drops the marker of exactly that field', async () => {
    await markings.save('user-1', 2025, { key: 'kapital.kapitalertraege', provenance: { kind: 'uebernahme', lastYear: 2024 }, confirmed: false, proposal: null })

    await service.setField('user-1', 2025, 'kapitalertraege', { kind: 'erfasst', value: 310 })

    expect(markings.all()).toEqual([])
  })
})
