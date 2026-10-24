// Fast, no-DB unit tier (ADR-0004): LstbService against FakeLstbRepository +
// FakeAuditRepository. Mirrors interview.service.test.ts / beleg.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real
// derived zustand through Prisma) lives in test/acceptance/req-016-lstb-angestellte.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'

const USER_ID = 'user-1'
const STEUERJAHR = 2026

describe('LstbService', () => {
  let repository: FakeLstbRepository
  let auditRepository: FakeAuditRepository
  let service: LstbService

  beforeEach(() => {
    repository = new FakeLstbRepository()
    auditRepository = new FakeAuditRepository()
    service = new LstbService(repository, new AuditService(auditRepository))
  })

  describe('getState — the honest empty mask', () => {
    it('a fresh tax year returns every field offen, unvollstaendig, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state.bruttoarbeitslohn).toEqual({ kind: 'offen' })
      expect(state.lohnsteuer).toEqual({ kind: 'offen' })
      expect(state.sozialversicherung).toEqual({ kind: 'offen' })
      expect(state.zustand).toEqual({
        kind: 'unvollstaendig',
        offen: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'],
        unklar: [],
      })
      expect(auditRepository.all()).toEqual([])
    })

    it('re-entry reflects stored facts and appends a READ audit entry', async () => {
      repository.seed({ userId: USER_ID, steuerjahr: STEUERJAHR, bruttoarbeitslohn: '50000', lohnsteuer: '9000', sozialversicherung: '10000' })

      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 50000 })
      expect(state.zustand).toEqual({ kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 9000, sozialversicherung: 10000 })
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'lstb' }])
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      repository.seed({ userId: 'someone-else', steuerjahr: STEUERJAHR, bruttoarbeitslohn: '1', lohnsteuer: null, sozialversicherung: null })

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.bruttoarbeitslohn).toEqual({ kind: 'offen' })
    })
  })

  describe('setFeld — the guided mask, field by field', () => {
    it('setting one field persists it and leaves the rest offen', async () => {
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 50000 })

      expect(state.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 50000 })
      expect(state.lohnsteuer).toEqual({ kind: 'offen' })
      expect(state.zustand).toEqual({
        kind: 'unvollstaendig',
        offen: ['lohnsteuer', 'sozialversicherung'],
        unklar: [],
      })
    })

    it('an unreadable field is reported under unklar, never guessed (ADR-036)', async () => {
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'lohnsteuer', { kind: 'unklar' })

      expect(state.lohnsteuer).toEqual({ kind: 'unklar' })
      expect(state.zustand).toEqual({
        kind: 'unvollstaendig',
        offen: ['bruttoarbeitslohn', 'sozialversicherung'],
        unklar: ['lohnsteuer'],
      })
    })

    it('a complete, consistent mask reaches vollstaendig with all three values', async () => {
      await service.setFeld(USER_ID, STEUERJAHR, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 50000 })
      await service.setFeld(USER_ID, STEUERJAHR, 'lohnsteuer', { kind: 'erfasst', wert: 9000 })
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'sozialversicherung', { kind: 'erfasst', wert: 10000 })

      expect(state.zustand).toEqual({ kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 9000, sozialversicherung: 10000 })
    })

    it('a figure exceeding the Bruttoarbeitslohn reports a widerspruch, never a silent fix (ADR-008)', async () => {
      await service.setFeld(USER_ID, STEUERJAHR, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 10000 })
      await service.setFeld(USER_ID, STEUERJAHR, 'lohnsteuer', { kind: 'erfasst', wert: 20000 })
      const state = await service.setFeld(USER_ID, STEUERJAHR, 'sozialversicherung', { kind: 'erfasst', wert: 0 })

      expect(state.zustand).toEqual({
        kind: 'widerspruch',
        widersprueche: [{ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 20000, bruttoarbeitslohn: 10000 }],
      })
    })

    it('rejects an erfasst field without a valid whole-euro amount (400)', async () => {
      await expect(service.setFeld(USER_ID, STEUERJAHR, 'bruttoarbeitslohn', { kind: 'erfasst' })).rejects.toThrow(
        /requires a non-negative whole-euro/,
      )
      await expect(service.setFeld(USER_ID, STEUERJAHR, 'bruttoarbeitslohn', { kind: 'erfasst', wert: -5 })).rejects.toThrow(
        /requires a non-negative whole-euro/,
      )
    })
  })
})
