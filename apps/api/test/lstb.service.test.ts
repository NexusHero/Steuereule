// Fast, no-DB unit tier (ADR-0004): LstbService against FakeLstbRepository +
// FakeAuditRepository. Mirrors interview.service.test.ts / beleg.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real
// derived zustand through Prisma) lives in test/acceptance/req-016-lstb-angestellte.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeMarkingRepository } from './fakes/fake-kennzeichnung.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'

const USER_ID = 'user-1'
const TAX_YEAR = 2026

describe('LstbService', () => {
  let markings: FakeMarkingRepository
  let repository: FakeLstbRepository
  let auditRepository: FakeAuditRepository
  let service: LstbService

  beforeEach(() => {
    repository = new FakeLstbRepository()
    auditRepository = new FakeAuditRepository()
    markings = new FakeMarkingRepository()
    service = new LstbService(repository, new AuditService(auditRepository), markings)
  })

  describe('getState — the honest empty mask', () => {
    it('a fresh tax year returns every field offen, unvollstaendig, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, TAX_YEAR)

      expect(state.bruttoarbeitslohn).toEqual({ kind: 'offen' })
      expect(state.lohnsteuer).toEqual({ kind: 'offen' })
      expect(state.sozialversicherung).toEqual({ kind: 'offen' })
      expect(state.state).toEqual({
        kind: 'unvollstaendig',
        open: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'],
        unclear: [],
      })
      expect(auditRepository.all()).toEqual([])
    })

    it('re-entry reflects stored facts and appends a READ audit entry', async () => {
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, bruttoarbeitslohn: '50000', lohnsteuer: '9000', sozialversicherung: '10000' })

      const state = await service.getState(USER_ID, TAX_YEAR)

      expect(state.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 50000 })
      expect(state.state).toEqual({ kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 9000, sozialversicherung: 10000 })
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'lstb' }])
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      repository.seed({ userId: 'someone-else', taxYear: TAX_YEAR, bruttoarbeitslohn: '1', lohnsteuer: null, sozialversicherung: null })

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.bruttoarbeitslohn).toEqual({ kind: 'offen' })
    })
  })

  describe('setFeld — the guided mask, field by field', () => {
    it('setting one field persists it and leaves the rest offen', async () => {
      const state = await service.setField(USER_ID, TAX_YEAR, 'bruttoarbeitslohn', { kind: 'erfasst', value: 50000 })

      expect(state.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 50000 })
      expect(state.lohnsteuer).toEqual({ kind: 'offen' })
      expect(state.state).toEqual({
        kind: 'unvollstaendig',
        open: ['lohnsteuer', 'sozialversicherung'],
        unclear: [],
      })
    })

    it('an unreadable field is reported under unklar, never guessed (ADR-036)', async () => {
      const state = await service.setField(USER_ID, TAX_YEAR, 'lohnsteuer', { kind: 'unklar' })

      expect(state.lohnsteuer).toEqual({ kind: 'unklar' })
      expect(state.state).toEqual({
        kind: 'unvollstaendig',
        open: ['bruttoarbeitslohn', 'sozialversicherung'],
        unclear: ['lohnsteuer'],
      })
    })

    it('a complete, consistent mask reaches vollstaendig with all three values', async () => {
      await service.setField(USER_ID, TAX_YEAR, 'bruttoarbeitslohn', { kind: 'erfasst', value: 50000 })
      await service.setField(USER_ID, TAX_YEAR, 'lohnsteuer', { kind: 'erfasst', value: 9000 })
      const state = await service.setField(USER_ID, TAX_YEAR, 'sozialversicherung', { kind: 'erfasst', value: 10000 })

      expect(state.state).toEqual({ kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 9000, sozialversicherung: 10000 })
    })

    it('a figure exceeding the Bruttoarbeitslohn reports a widerspruch, never a silent fix (ADR-008)', async () => {
      await service.setField(USER_ID, TAX_YEAR, 'bruttoarbeitslohn', { kind: 'erfasst', value: 10000 })
      await service.setField(USER_ID, TAX_YEAR, 'lohnsteuer', { kind: 'erfasst', value: 20000 })
      const state = await service.setField(USER_ID, TAX_YEAR, 'sozialversicherung', { kind: 'erfasst', value: 0 })

      expect(state.state).toEqual({
        kind: 'widerspruch',
        conflicts: [{ kind: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 20000, bruttoarbeitslohn: 10000 }],
      })
    })

    it('rejects an erfasst field without a valid whole-euro amount (400)', async () => {
      await expect(service.setField(USER_ID, TAX_YEAR, 'bruttoarbeitslohn', { kind: 'erfasst' })).rejects.toThrow(
        /requires a non-negative whole-euro/,
      )
      await expect(service.setField(USER_ID, TAX_YEAR, 'bruttoarbeitslohn', { kind: 'erfasst', value: -5 })).rejects.toThrow(
        /requires a non-negative whole-euro/,
      )
    })
  })

  it('ADR-0052 §6: a user write drops the marker of exactly that field — changing it is confirming it', async () => {
    await markings.save('user-1', 2025, { key: 'lstb.lohnsteuer', provenance: { kind: 'assistent', name: 'Claude' }, confirmed: false, proposal: null })
    await markings.save('user-1', 2025, { key: 'lstb.bruttoarbeitslohn', provenance: { kind: 'assistent', name: 'Claude' }, confirmed: false, proposal: null })

    await service.setField('user-1', 2025, 'lohnsteuer', { kind: 'erfasst', value: 700 })

    expect(markings.all().map((k) => k.key)).toEqual(['lstb.bruttoarbeitslohn'])
  })
})
