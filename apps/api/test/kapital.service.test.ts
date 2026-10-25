// Fast, no-DB unit tier (ADR-0004): KapitalService against FakeKapitalRepository +
// FakeInterviewAnswerRepository + FakeLstbRepository + FakeTaxYearRepository + FakeAuditRepository.
// Mirrors rente.service.test.ts. The full real-Postgres proof (ciphertext at rest, audit
// atomicity, cross-user isolation, the real fold through Prisma) lives in
// test/acceptance/req-025-kapital.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { KapitalService } from '../src/kapital/kapital.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeKapitalRepository } from './fakes/fake-kapital.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'

const USER_ID = 'user-1'
const STEUERJAHR = 2026

describe('KapitalService', () => {
  let repository: FakeKapitalRepository
  let interviewRepository: FakeInterviewAnswerRepository
  let lstbRepository: FakeLstbRepository
  let taxYearRepository: FakeTaxYearRepository
  let auditRepository: FakeAuditRepository
  let service: KapitalService

  beforeEach(() => {
    repository = new FakeKapitalRepository()
    interviewRepository = new FakeInterviewAnswerRepository()
    lstbRepository = new FakeLstbRepository()
    taxYearRepository = new FakeTaxYearRepository()
    auditRepository = new FakeAuditRepository()
    service = new KapitalService(repository, interviewRepository, lstbRepository, taxYearRepository, new AuditService(auditRepository))
  })

  describe('getState — the honest empty mask and the depot-Einordnung', () => {
    it('a fresh tax year returns the field offen, depot unbekannt, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state.kapitalertraege).toEqual({ kind: 'offen' })
      expect(state.depot).toEqual({ kind: 'unbekannt' })
      expect(state.posten).toEqual([])
      expect(state.stand).toMatchObject({ kind: 'offen', einnahmen: 0, offenePosten: 1 })
      expect(auditRepository.all()).toEqual([])
    })

    it('derives the depot-Einordnung from the stored kap-depot answer — never a column of its own', async () => {
      interviewRepository.seed(USER_ID, STEUERJAHR, { 'kap-depot': 'Ausländischer Broker' })

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.depot).toEqual({ kind: 'auslaendischer-broker' })
    })

    it('re-entry reflects stored facts and appends a READ audit entry', async () => {
      repository.seed({ userId: USER_ID, steuerjahr: STEUERJAHR, kapitalertraege: '2500' })
      interviewRepository.seed(USER_ID, STEUERJAHR, { 'kap-depot': 'Deutscher Broker' })

      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state.kapitalertraege).toEqual({ kind: 'erfasst', wert: 2500 })
      expect(state.depot).toEqual({ kind: 'deutscher-broker' })
      expect(state.posten).toEqual([{ id: 'kapital', betrag: 2500, herkunft: 'eingabe' }])
      expect(state.stand).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'kapital' }])
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      repository.seed({ userId: 'someone-else', steuerjahr: STEUERJAHR, kapitalertraege: '1' })

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.kapitalertraege).toEqual({ kind: 'offen' })
    })
  })

  describe('setFeld — the guided mask', () => {
    it('captures the Kapitalerträge and folds them through the core', async () => {
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'kapitalertraege', { kind: 'erfasst', wert: 2500 })

      expect(state.kapitalertraege).toEqual({ kind: 'erfasst', wert: 2500 })
      expect(state.posten).toEqual([{ id: 'kapital', betrag: 2500, herkunft: 'eingabe' }])
      expect(state.stand).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })
    })

    it('accepts unklar — the field stays honestly unreadable, the fold stays offen', async () => {
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'kapitalertraege', { kind: 'unklar' })

      expect(state.kapitalertraege).toEqual({ kind: 'unklar' })
      expect(state.posten).toEqual([])
      expect(state.stand).toMatchObject({ kind: 'offen', offenePosten: 1 })
    })

    it('rejects an erfasst without a valid amount (400)', async () => {
      await expect(service.setFeld(USER_ID, STEUERJAHR, 'kapitalertraege', { kind: 'erfasst' })).rejects.toThrow('requires a non-negative integer')
      await expect(service.setFeld(USER_ID, STEUERJAHR, 'kapitalertraege', { kind: 'erfasst', wert: -1 })).rejects.toThrow('requires a non-negative integer')
    })

    it('a Krypto-Anleger reads offen with the gate named (ADR-032)', async () => {
      interviewRepository.seed(USER_ID, STEUERJAHR, { einkuenfte: 'Kapitalerträge', 'kap-depot': 'Krypto' })

      const state = await service.setFeld(USER_ID, STEUERJAHR, 'kapitalertraege', { kind: 'erfasst', wert: 2500 })

      expect(state.depot).toEqual({ kind: 'krypto' })
      expect(state.stand).toMatchObject({ kind: 'offen', gegated: ['Kapital'] })
    })
  })

  describe('getGuenstigerpruefung — the § 32d Abs. 6 bounded comparison with honest gates', () => {
    function seedTaxYear(): void {
      taxYearRepository.seed(USER_ID, { steuerjahr: STEUERJAHR, openItems: 0 })
    }

    it('returns null when no tax year is seeded (the honest empty state)', async () => {
      const ergebnis = await service.getGuenstigerpruefung(USER_ID, STEUERJAHR, 0)
      expect(ergebnis).toBeNull()
    })

    it('a German broker with captured Kapitalerträge yields the core\'s bounded comparison', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, steuerjahr: STEUERJAHR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, STEUERJAHR, { job: 'Angestellt', 'kap-depot': 'Deutscher Broker', lohnersatz: 'Nein' })
      lstbRepository.seed({
        userId: USER_ID,
        steuerjahr: STEUERJAHR,
        bruttoarbeitslohn: '60000',
        lohnsteuer: null,
        sozialversicherung: null,
      })

      const ergebnis = await service.getGuenstigerpruefung(USER_ID, STEUERJAHR, 0)

      expect(ergebnis?.kind).toBe('eindeutig')
      if (ergebnis?.kind === 'eindeutig') {
        expect(ergebnis.empfehlung).toBe('abgeltung')
        expect(ergebnis.abgeltung).toBe(4750)
        expect(ergebnis.delta).toBe(3732)
      }
      expect(ergebnis?.herkunft).toEqual({
        kapitalertraege: 20000,
        uebrigesZvE: 60000,
        sparerpauschbetrag: 1000,
        veranlagung: 'einzel',
        bestandteile: ['einkommensteuer', 'solidaritaetszuschlag'],
      })
    })

    it('a foreign broker withheld no Abgeltungsteuer — KAP-Pflicht, never a guessed comparison', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, steuerjahr: STEUERJAHR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, STEUERJAHR, { 'kap-depot': 'Ausländischer Broker' })

      const ergebnis = await service.getGuenstigerpruefung(USER_ID, STEUERJAHR, 0)

      expect(ergebnis).toEqual({ kind: 'nicht-anwendbar', grund: 'keine-abgeltung-einbehalten' })
    })

    it('Krypto is gated, an unanswered kap-depot is never guessed, missing Kapitalerträge are named', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, steuerjahr: STEUERJAHR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, STEUERJAHR, { 'kap-depot': 'Krypto' })
      expect(await service.getGuenstigerpruefung(USER_ID, STEUERJAHR, 0)).toEqual({ kind: 'nicht-anwendbar', grund: 'krypto-gegated' })

      interviewRepository.seed(USER_ID, STEUERJAHR, { 'kap-depot': 'irgendwas-anders' })
      expect(await service.getGuenstigerpruefung(USER_ID, STEUERJAHR, 0)).toEqual({ kind: 'nicht-anwendbar', grund: 'kap-depot-nicht-beantwortet' })

      interviewRepository.seed(USER_ID, STEUERJAHR, { 'kap-depot': 'Deutscher Broker' })
      repository.seed({ userId: USER_ID, steuerjahr: STEUERJAHR, kapitalertraege: null })
      expect(await service.getGuenstigerpruefung(USER_ID, STEUERJAHR, 0)).toEqual({ kind: 'nicht-anwendbar', grund: 'keine-kapitalertraege' })
    })

    it('a missing Progressionsvorbehalt answer makes the comparison unbestimmt — no verdict', async () => {
      seedTaxYear()
      repository.seed({ userId: USER_ID, steuerjahr: STEUERJAHR, kapitalertraege: '20000' })
      interviewRepository.seed(USER_ID, STEUERJAHR, { 'kap-depot': 'Deutscher Broker' })

      const ergebnis = await service.getGuenstigerpruefung(USER_ID, STEUERJAHR, 0)

      expect(ergebnis?.kind).toBe('unbestimmt')
      if (ergebnis?.kind === 'unbestimmt') {
        expect(ergebnis.unschaerfe).toEqual({ kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' })
      }
    })
  })
})
