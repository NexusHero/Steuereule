// Fast, no-DB unit tier (ADR-0004): RenteService against FakeRenteRepository +
// FakeInterviewAnswerRepository + FakeAuditRepository. Mirrors lstb.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real fold
// through Prisma) lives in test/acceptance/req-022-rentner.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { RenteService } from '../src/rente/rente.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeRenteRepository } from './fakes/fake-rente.repository.js'

const USER_ID = 'user-1'
const STEUERJAHR = 2026

describe('RenteService', () => {
  let repository: FakeRenteRepository
  let interviewRepository: FakeInterviewAnswerRepository
  let auditRepository: FakeAuditRepository
  let service: RenteService

  beforeEach(() => {
    repository = new FakeRenteRepository()
    interviewRepository = new FakeInterviewAnswerRepository()
    auditRepository = new FakeAuditRepository()
    service = new RenteService(repository, interviewRepository, new AuditService(auditRepository))
  })

  describe('getState — the honest empty mask', () => {
    it('a fresh tax year returns art null, every field offen, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state.art).toBeNull()
      expect(state.jahresbetrag).toEqual({ kind: 'offen' })
      expect(state.rentenbeginnJahr).toEqual({ kind: 'offen' })
      expect(state.alterBeiRentenbeginn).toEqual({ kind: 'offen' })
      expect(state.posten).toEqual([])
      expect(state.stand).toMatchObject({ kind: 'offen', einnahmen: 0, offenePosten: 1 })
      expect(auditRepository.all()).toEqual([])
    })

    it('re-entry reflects stored facts and appends a READ audit entry', async () => {
      repository.seed({
        userId: USER_ID,
        steuerjahr: STEUERJAHR,
        rentenart: 'GesetzlicheRente',
        jahresbetrag: '20000',
        rentenbeginnJahr: '2020',
        alterBeiRentenbeginn: null,
      })

      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state.art).toBe('GesetzlicheRente')
      expect(state.jahresbetrag).toEqual({ kind: 'erfasst', wert: 20000 })
      expect(state.stand).toMatchObject({ kind: 'bestimmt', einnahmen: 16000 })
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'rente' }])
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      repository.seed({ userId: 'someone-else', steuerjahr: STEUERJAHR, rentenart: 'GesetzlicheRente', jahresbetrag: '1', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.art).toBeNull()
      expect(state.jahresbetrag).toEqual({ kind: 'offen' })
    })
  })

  describe('setRentenart + setFeld — the guided mask', () => {
    it('choosing a Rentenart persists it and leaves the fields offen', async () => {
      const state = await service.setRentenart(USER_ID, STEUERJAHR, { art: 'GesetzlicheRente' })

      expect(state.art).toBe('GesetzlicheRente')
      expect(state.jahresbetrag).toEqual({ kind: 'offen' })
      expect(state.stand).toMatchObject({ kind: 'offen', offenePosten: 1 })
    })

    it('clearing the Rentenart (null) returns to the empty mask', async () => {
      await service.setRentenart(USER_ID, STEUERJAHR, { art: 'GesetzlicheRente' })
      const state = await service.setRentenart(USER_ID, STEUERJAHR, { art: null })

      expect(state.art).toBeNull()
    })

    it('a complete gesetzliche Rente folds to its taxable share with Herkunft', async () => {
      await service.setRentenart(USER_ID, STEUERJAHR, { art: 'GesetzlicheRente' })
      await service.setFeld(USER_ID, STEUERJAHR, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'rentenbeginnJahr', { kind: 'erfasst', wert: 2020 })

      expect(state.stand).toEqual({ kind: 'bestimmt', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0 })
      expect(state.posten).toEqual([
        { id: 'rente', betrag: 16000, herkunft: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2020: 80 %' },
      ])
    })

    it('a private Rentenversicherung folds via the Ertragsanteil, citing bb', async () => {
      await service.setRentenart(USER_ID, STEUERJAHR, { art: 'PrivateRentenversicherung' })
      await service.setFeld(USER_ID, STEUERJAHR, 'jahresbetrag', { kind: 'erfasst', wert: 10000 })
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'alterBeiRentenbeginn', { kind: 'erfasst', wert: 65 })

      expect(state.stand).toMatchObject({ kind: 'bestimmt', einnahmen: 1800 })
      expect(state.posten[0]?.herkunft).toBe('§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — Ertragsanteil bei Rentenbeginn mit 65 Jahren: 18 %')
    })

    it('an unklar field stays offen, never guessed (ADR-036)', async () => {
      await service.setRentenart(USER_ID, STEUERJAHR, { art: 'GesetzlicheRente' })
      await service.setFeld(USER_ID, STEUERJAHR, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'rentenbeginnJahr', { kind: 'unklar' })

      expect(state.rentenbeginnJahr).toEqual({ kind: 'unklar' })
      expect(state.stand).toMatchObject({ kind: 'offen', offenePosten: 1, einnahmen: 0 })
    })

    it('a gated Einkunftsart (e.g. Krypto-Kapital) keeps the fold offen and names it', async () => {
      interviewRepository.seed(USER_ID, STEUERJAHR, { job: 'Rente', einkuenfte: 'Kapitalerträge', 'kap-depot': 'Krypto' })
      await service.setRentenart(USER_ID, STEUERJAHR, { art: 'GesetzlicheRente' })
      await service.setFeld(USER_ID, STEUERJAHR, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'rentenbeginnJahr', { kind: 'erfasst', wert: 2020 })

      expect(state.stand).toMatchObject({ kind: 'offen', einnahmen: 16000, gegated: ['Kapital'] })
    })

    it('rejects an erfasst field without a valid value (400)', async () => {
      await expect(service.setFeld(USER_ID, STEUERJAHR, 'jahresbetrag', { kind: 'erfasst' })).rejects.toThrow(/non-negative integer/)
      await expect(service.setFeld(USER_ID, STEUERJAHR, 'jahresbetrag', { kind: 'erfasst', wert: -5 })).rejects.toThrow(/non-negative integer/)
    })

    it('rejects an undeclared Rentenart (400)', async () => {
      await expect(service.setRentenart(USER_ID, STEUERJAHR, { art: 'Rente' as never })).rejects.toThrow(/five Rentenarten/)
    })
  })
})
