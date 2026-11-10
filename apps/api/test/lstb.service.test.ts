// Fast, no-DB unit tier (ADR-0004): LstbService against FakeLstbRepository +
// FakeAuditRepository. Mirrors interview.service.test.ts / beleg.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real
// derived zustand through Prisma) lives in test/acceptance/req-016-lstb-angestellte.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryAdvisorRepository } from '../src/advisor/advisor.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { ConflictError, InvalidInputError } from '../src/common/domain-error.js'
import { LstbService } from '../src/lstb/lstb.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'

const USER_ID = 'user-1'
const TAX_YEAR = 2026

describe('LstbService', () => {
  let markings: FakeMarkingRepository
  let repository: FakeLstbRepository
  let auditRepository: FakeAuditRepository
  let receiptRepository: FakeReceiptRepository
  let advisorRepository: InMemoryAdvisorRepository
  let service: LstbService

  beforeEach(() => {
    repository = new FakeLstbRepository()
    auditRepository = new FakeAuditRepository()
    markings = new FakeMarkingRepository()
    receiptRepository = new FakeReceiptRepository()
    advisorRepository = new InMemoryAdvisorRepository()
    service = new LstbService(
      repository,
      new AuditService(auditRepository),
      markings,
      receiptRepository,
      advisorRepository,
    )
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

  describe('applyConfirmedScan — atomic batch confirmation with receipt provenance (#444)', () => {
    it('writes all 3 fields, stores { kind: "beleg", receiptId } provenance markings, and marks staged actions applied', async () => {
      const receipt = await receiptRepository.create(USER_ID, { fileName: 'lstb-2026.pdf' })
      const msg = await advisorRepository.createMessage({
        userId: USER_ID,
        taxYear: TAX_YEAR,
        role: 'assistant',
        content: 'LStB erkannt.',
        meta: {
          lstbScan: { receiptId: receipt.id, stage: 'deterministic', taxYearOnDocument: TAX_YEAR, actionIds: ['act-1'] },
          actions: [
            {
              actionId: 'act-1',
              status: 'pending',
              screen: 'lstb',
              field: 'bruttoarbeitslohn',
              instance: null,
              label: 'Bruttoarbeitslohn',
              previousValue: null,
              newValue: '54320',
              beforeRefundEur: 0,
              afterRefundEur: 0,
              deltaEur: 0,
              reason: 'Zeile 3',
              sourceId: 'estg-9-1',
            },
          ],
        },
      })

      const result = await service.applyConfirmedScan(USER_ID, USER_ID, TAX_YEAR, {
        bruttoarbeitslohn: 54320,
        lohnsteuer: 9840,
        sozialversicherung: 10912,
        receiptId: receipt.id,
        actionIds: ['act-1'],
      })

      expect(result.state).toEqual({
        kind: 'vollstaendig',
        bruttoarbeitslohn: 54320,
        lohnsteuer: 9840,
        sozialversicherung: 10912,
      })

      const savedMarkings = markings.all()
      expect(savedMarkings).toHaveLength(3)
      for (const m of savedMarkings) {
        expect(m.provenance).toEqual({ kind: 'beleg', receiptId: receipt.id })
        expect(m.confirmed).toBe(true)
      }

      const reloadedMsg = (await advisorRepository.listForUserAndYear(USER_ID, TAX_YEAR)).find((r) => r.id === msg.id)
      expect(reloadedMsg?.meta?.actions?.[0]?.status).toBe('applied')
    })

    it('throws ConflictError (409) when LStB values already exist unless overwriteExisting is true (ADR-0008)', async () => {
      repository.seed({
        userId: USER_ID,
        taxYear: TAX_YEAR,
        bruttoarbeitslohn: '40000',
        lohnsteuer: '6000',
        sozialversicherung: '8000',
      })

      await expect(
        service.applyConfirmedScan(USER_ID, USER_ID, TAX_YEAR, {
          bruttoarbeitslohn: 54320,
          lohnsteuer: 9840,
          sozialversicherung: 10912,
        }),
      ).rejects.toBeInstanceOf(ConflictError)

      const overwritten = await service.applyConfirmedScan(USER_ID, USER_ID, TAX_YEAR, {
        bruttoarbeitslohn: 54320,
        lohnsteuer: 9840,
        sozialversicherung: 10912,
        overwriteExisting: true,
      })
      expect(overwritten.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 54320 })
    })

    it('rejects implausible values (LSt or SV > Brutto) cleanly before touching persistence', async () => {
      await expect(
        service.applyConfirmedScan(USER_ID, USER_ID, TAX_YEAR, {
          bruttoarbeitslohn: 10000,
          lohnsteuer: 12000,
          sozialversicherung: 2000,
        }),
      ).rejects.toBeInstanceOf(InvalidInputError)

      expect(await repository.findForUserAndYear(USER_ID, TAX_YEAR)).toBeNull()
    })

    it('rejects foreign receiptId without leaking existence', async () => {
      const otherReceipt = await receiptRepository.create('other-user', { fileName: 'other.pdf' })
      await expect(
        service.applyConfirmedScan(USER_ID, USER_ID, TAX_YEAR, {
          bruttoarbeitslohn: 50000,
          lohnsteuer: 8000,
          sozialversicherung: 10000,
          receiptId: otherReceipt.id,
        }),
      ).rejects.toThrow(/does not exist/)
    })
  })
})
