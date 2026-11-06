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

const USER_ID = 'user-1'
const TAX_YEAR = 2026

describe('KapitalService', () => {
  let markings: FakeMarkingRepository
  let repository: FakeCapitalRepository
  let interviewRepository: FakeInterviewAnswerRepository
  let lstbRepository: FakeLstbRepository
  let taxYearRepository: FakeTaxYearRepository
  let auditRepository: FakeAuditRepository
  let service: CapitalService

  beforeEach(() => {
    repository = new FakeCapitalRepository()
    interviewRepository = new FakeInterviewAnswerRepository()
    lstbRepository = new FakeLstbRepository()
    taxYearRepository = new FakeTaxYearRepository()
    auditRepository = new FakeAuditRepository()
    markings = new FakeMarkingRepository()
    service = new CapitalService(repository, interviewRepository, lstbRepository, taxYearRepository, new AuditService(auditRepository), markings)
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

  describe('getGuenstigerpruefung — the § 32d Abs. 6 bounded comparison with honest gates', () => {
    function seedTaxYear(): void {
      taxYearRepository.seed(USER_ID, { taxYear: TAX_YEAR, openItems: 0 })
    }

    it('returns null when no tax year is seeded (the honest empty state)', async () => {
      const result = await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)
      expect(result).toBeNull()
    })

    it('a German broker with captured Kapitalerträge yields the core\'s bounded comparison', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, TAX_YEAR, { job: 'Angestellt', 'kap-depot': 'Deutscher Broker', lohnersatz: 'Nein' })
      lstbRepository.seed({
        userId: USER_ID,
        taxYear: TAX_YEAR,
        bruttoarbeitslohn: '60000',
        lohnsteuer: null,
        sozialversicherung: null,
      })

      const result = await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)

      expect(result?.kind).toBe('eindeutig')
      if (result?.kind === 'eindeutig') {
        expect(result.recommendation).toBe('abgeltung')
        expect(result.flatRateTax).toBe(4750)
        expect(result.delta).toBe(3732)
      }
      expect(result?.provenance).toEqual({
        kapitalertraege: 20000,
        remainingZvE: 60000,
        saversAllowance: 1000,
        assessmentType: 'einzel',
        components: ['einkommensteuer', 'solidaritaetszuschlag'],
      })
    })

    it('a foreign broker withheld no Abgeltungsteuer — KAP-Pflicht, never a guessed comparison', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, TAX_YEAR, { 'kap-depot': 'Ausländischer Broker' })

      const result = await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)

      expect(result).toEqual({ kind: 'nicht-anwendbar', reason: 'keine-abgeltung-einbehalten' })
    })

    it('Krypto is gated, an unanswered kap-depot is never guessed, missing Kapitalerträge are named', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, TAX_YEAR, { 'kap-depot': 'Krypto' })
      expect(await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'krypto-gegated' })

      interviewRepository.seed(USER_ID, TAX_YEAR, { 'kap-depot': 'irgendwas-anders' })
      expect(await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'kap-depot-nicht-beantwortet' })

      interviewRepository.seed(USER_ID, TAX_YEAR, { 'kap-depot': 'Deutscher Broker' })
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, kapitalertraege: null })
      expect(await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)).toEqual({ kind: 'nicht-anwendbar', reason: 'keine-kapitalertraege' })
    })

    it('a missing Progressionsvorbehalt answer makes the comparison unbestimmt — no verdict', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, TAX_YEAR, { 'kap-depot': 'Deutscher Broker' })

      const result = await service.getMostFavourableCheck(USER_ID, TAX_YEAR, 0)

      expect(result?.kind).toBe('unbestimmt')
      if (result?.kind === 'unbestimmt') {
        expect(result.uncertainty).toEqual({ kind: 'unbestimmt', reason: 'progressionsvorbehalt-nicht-eingegeben' })
      }
    })
  })

  it('ADR-0052 §6: a user write drops the marker of exactly that field', async () => {
    await markings.save('user-1', 2025, { key: 'kapital.kapitalertraege', provenance: { kind: 'uebernahme', lastYear: 2024 }, confirmed: false, proposal: null })

    await service.setField('user-1', 2025, 'kapitalertraege', { kind: 'erfasst', value: 310 })

    expect(markings.all()).toEqual([])
  })
})
