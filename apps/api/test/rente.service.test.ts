// Fast, no-DB unit tier (ADR-0004): RenteService against FakeRenteRepository +
// FakeInterviewAnswerRepository + FakeAuditRepository. Mirrors lstb.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real fold
// through Prisma) lives in test/acceptance/req-022-rentner.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeMarkingRepository } from './fakes/fake-kennzeichnung.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { PensionService } from '../src/rente/rente.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakePensionRepository } from './fakes/fake-rente.repository.js'

const USER_ID = 'user-1'
const TAX_YEAR = 2026

describe('RenteService', () => {
  let markings: FakeMarkingRepository
  let repository: FakePensionRepository
  let interviewRepository: FakeInterviewAnswerRepository
  let auditRepository: FakeAuditRepository
  let service: PensionService

  beforeEach(() => {
    repository = new FakePensionRepository()
    interviewRepository = new FakeInterviewAnswerRepository()
    auditRepository = new FakeAuditRepository()
    markings = new FakeMarkingRepository()
    service = new PensionService(repository, interviewRepository, new AuditService(auditRepository), markings)
  })

  describe('getState — the honest empty mask', () => {
    it('a fresh tax year returns art null, every field offen, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, TAX_YEAR)

      expect(state.art).toBeNull()
      expect(state.jahresbetrag).toEqual({ kind: 'offen' })
      expect(state.rentenbeginnJahr).toEqual({ kind: 'offen' })
      expect(state.alterBeiRentenbeginn).toEqual({ kind: 'offen' })
      expect(state.items).toEqual([])
      expect(state.status).toMatchObject({ kind: 'offen', einnahmen: 0, openItems: 1 })
      expect(auditRepository.all()).toEqual([])
    })

    it('re-entry reflects stored facts and appends a READ audit entry', async () => {
      repository.seed({
        userId: USER_ID,
        steuerjahr: TAX_YEAR,
        rentenart: 'GesetzlicheRente',
        jahresbetrag: '20000',
        rentenbeginnJahr: '2020',
        alterBeiRentenbeginn: null,
      })

      const state = await service.getState(USER_ID, TAX_YEAR)

      expect(state.art).toBe('GesetzlicheRente')
      expect(state.jahresbetrag).toEqual({ kind: 'erfasst', value: 20000 })
      expect(state.status).toMatchObject({ kind: 'bestimmt', einnahmen: 16000 })
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'rente' }])
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      repository.seed({ userId: 'someone-else', steuerjahr: TAX_YEAR, rentenart: 'GesetzlicheRente', jahresbetrag: '1', rentenbeginnJahr: '2020', alterBeiRentenbeginn: null })

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.art).toBeNull()
      expect(state.jahresbetrag).toEqual({ kind: 'offen' })
    })
  })

  describe('setRentenart + setFeld — the guided mask', () => {
    it('choosing a Rentenart persists it and leaves the fields offen', async () => {
      const state = await service.setPensionKind(USER_ID, TAX_YEAR, { art: 'GesetzlicheRente' })

      expect(state.art).toBe('GesetzlicheRente')
      expect(state.jahresbetrag).toEqual({ kind: 'offen' })
      expect(state.status).toMatchObject({ kind: 'offen', openItems: 1 })
    })

    it('clearing the Rentenart (null) returns to the empty mask', async () => {
      await service.setPensionKind(USER_ID, TAX_YEAR, { art: 'GesetzlicheRente' })
      const state = await service.setPensionKind(USER_ID, TAX_YEAR, { art: null })

      expect(state.art).toBeNull()
    })

    it('a complete gesetzliche Rente folds to its taxable share with Herkunft', async () => {
      await service.setPensionKind(USER_ID, TAX_YEAR, { art: 'GesetzlicheRente' })
      await service.setField(USER_ID, TAX_YEAR, 'jahresbetrag', { kind: 'erfasst', value: 20000 })
      const state = await service.setField(USER_ID, TAX_YEAR, 'rentenbeginnJahr', { kind: 'erfasst', value: 2020 })

      expect(state.status).toEqual({ kind: 'bestimmt', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0 })
      expect(state.items).toEqual([
        { id: 'rente', amount: 16000, provenance: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2020: 80 %' },
      ])
    })

    it('a private Rentenversicherung folds via the Ertragsanteil, citing bb', async () => {
      await service.setPensionKind(USER_ID, TAX_YEAR, { art: 'PrivateRentenversicherung' })
      await service.setField(USER_ID, TAX_YEAR, 'jahresbetrag', { kind: 'erfasst', value: 10000 })
      const state = await service.setField(USER_ID, TAX_YEAR, 'alterBeiRentenbeginn', { kind: 'erfasst', value: 65 })

      expect(state.status).toMatchObject({ kind: 'bestimmt', einnahmen: 1800 })
      expect(state.items[0]?.provenance).toBe('§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — Ertragsanteil bei Rentenbeginn mit 65 Jahren: 18 %')
    })

    it('an unklar field stays offen, never guessed (ADR-036)', async () => {
      await service.setPensionKind(USER_ID, TAX_YEAR, { art: 'GesetzlicheRente' })
      await service.setField(USER_ID, TAX_YEAR, 'jahresbetrag', { kind: 'erfasst', value: 20000 })
      const state = await service.setField(USER_ID, TAX_YEAR, 'rentenbeginnJahr', { kind: 'unklar' })

      expect(state.rentenbeginnJahr).toEqual({ kind: 'unklar' })
      expect(state.status).toMatchObject({ kind: 'offen', openItems: 1, einnahmen: 0 })
    })

    it('a gated Einkunftsart (e.g. Krypto-Kapital) keeps the fold offen and names it', async () => {
      interviewRepository.seed(USER_ID, TAX_YEAR, { job: 'Rente', einkuenfte: 'Kapitalerträge', 'kap-depot': 'Krypto' })
      await service.setPensionKind(USER_ID, TAX_YEAR, { art: 'GesetzlicheRente' })
      await service.setField(USER_ID, TAX_YEAR, 'jahresbetrag', { kind: 'erfasst', value: 20000 })
      const state = await service.setField(USER_ID, TAX_YEAR, 'rentenbeginnJahr', { kind: 'erfasst', value: 2020 })

      expect(state.status).toMatchObject({ kind: 'offen', einnahmen: 16000, gated: ['Kapital'] })
    })

    it('rejects an erfasst field without a valid value (400)', async () => {
      await expect(service.setField(USER_ID, TAX_YEAR, 'jahresbetrag', { kind: 'erfasst' })).rejects.toThrow(/non-negative integer/)
      await expect(service.setField(USER_ID, TAX_YEAR, 'jahresbetrag', { kind: 'erfasst', value: -5 })).rejects.toThrow(/non-negative integer/)
    })

    it('rejects an undeclared Rentenart (400)', async () => {
      await expect(service.setPensionKind(USER_ID, TAX_YEAR, { art: 'Rente' as never })).rejects.toThrow(/five Rentenarten/)
    })
  })

  it('ADR-0052 §6: a user write drops the marker of exactly that field (incl. the Rentenart)', async () => {
    await markings.save('user-1', 2025, { key: 'rente.jahresbetrag', provenance: { art: 'uebernahme', vorjahr: 2024 }, bestaetigt: false, proposal: null })
    await markings.save('user-1', 2025, { key: 'rente.rentenart', provenance: { art: 'uebernahme', vorjahr: 2024 }, bestaetigt: false, proposal: null })
    await markings.save('user-1', 2025, { key: 'rente.rentenbeginnJahr', provenance: { art: 'uebernahme', vorjahr: 2024 }, bestaetigt: false, proposal: null })

    await service.setField('user-1', 2025, 'jahresbetrag', { kind: 'erfasst', value: 12000 })
    await service.setPensionKind('user-1', 2025, { art: 'GesetzlicheRente' })

    expect(markings.all().map((k) => k.key)).toEqual(['rente.rentenbeginnJahr'])
  })
})
