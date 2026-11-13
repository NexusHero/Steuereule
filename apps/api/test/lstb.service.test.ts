// Fast, no-DB unit tier (ADR-0004): LstbService against FakeLstbRepository +
// FakeAuditRepository. Mirrors interview.service.test.ts / beleg.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real
// derived zustand through Prisma) lives in test/acceptance/req-016-lstb-angestellte.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { ConflictError, InvalidInputError } from '../src/common/domain-error.js'
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

  describe('church tax lines (Zeilen 6 und 7, ADR-0063)', () => {
    it('are not entered until the user enters them', async () => {
      expect(await service.getChurchTax(USER_ID, 2025)).toEqual({ kirchensteuer: null, kirchensteuerEhegatte: null })
    })

    it('stores whole euros next to the three required fields, without touching them', async () => {
      await service.setField(USER_ID, 2025, 'lohnsteuer', { kind: 'erfasst', value: 6100 })
      expect(await service.setChurchTax(USER_ID, 2025, { kirchensteuer: 540, kirchensteuerEhegatte: null })).toEqual({ kirchensteuer: 540, kirchensteuerEhegatte: null })
      expect(await service.getChurchTax(USER_ID, 2025)).toEqual({ kirchensteuer: 540, kirchensteuerEhegatte: null })
      expect((await service.getState(USER_ID, 2025)).lohnsteuer).toEqual({ kind: 'erfasst', value: 6100 })
    })

    it('rejects negative or fractional amounts', async () => {
      await expect(service.setChurchTax(USER_ID, 2025, { kirchensteuer: -1, kirchensteuerEhegatte: null })).rejects.toThrow(/whole-euro/)
      await expect(service.setChurchTax(USER_ID, 2025, { kirchensteuer: 10.5, kirchensteuerEhegatte: null })).rejects.toThrow(/whole-euro/)
    })
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

  describe('applyScannedValues — confirmed scan values with Beleg provenance (#444)', () => {
    const scanned = { bruttoarbeitslohn: 54320, lohnsteuer: 9840, sozialversicherung: 10912 }

    it('writes all 3 fields and stores { kind: "beleg", receiptId } provenance markings', async () => {
      const result = await service.applyScannedValues(USER_ID, TAX_YEAR, scanned, {
        receiptId: 'beleg-1',
        overwriteExisting: false,
      })

      expect(result.state).toEqual({ kind: 'vollstaendig', ...scanned })
      const savedMarkings = markings.all()
      expect(savedMarkings).toHaveLength(3)
      for (const m of savedMarkings) {
        expect(m.provenance).toEqual({ kind: 'beleg', receiptId: 'beleg-1' })
        expect(m.confirmed).toBe(true)
      }
    })

    it('throws ConflictError (409) when LStB values already exist unless overwriteExisting is true (ADR-0008)', async () => {
      repository.seed({
        userId: USER_ID,
        taxYear: TAX_YEAR,
        bruttoarbeitslohn: '40000',
        lohnsteuer: '6000',
        sozialversicherung: '8000',
      })
      expect(await service.existingValues(USER_ID, TAX_YEAR)).toEqual({
        hasExisting: true,
        existing: { bruttoarbeitslohn: 40000, lohnsteuer: 6000, sozialversicherung: 8000 },
      })

      await expect(
        service.applyScannedValues(USER_ID, TAX_YEAR, scanned, { receiptId: null, overwriteExisting: false }),
      ).rejects.toBeInstanceOf(ConflictError)

      const overwritten = await service.applyScannedValues(USER_ID, TAX_YEAR, scanned, {
        receiptId: null,
        overwriteExisting: true,
      })
      expect(overwritten.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 54320 })
    })

    it('adds a second certificate of the same year to the first, when the user asks for it', async () => {
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, bruttoarbeitslohn: '40000', lohnsteuer: '6000', sozialversicherung: '8000' })
      const added = await service.applyScannedValues(USER_ID, TAX_YEAR, scanned, { receiptId: 'beleg-2', overwriteExisting: false, addToExisting: true })
      expect(added.state).toEqual({ kind: 'vollstaendig', bruttoarbeitslohn: 94320, lohnsteuer: 15840, sozialversicherung: 18912 })
      // A sum of two certificates is no longer one receipt's figure: the user's own, confirmed.
      for (const m of markings.all()) expect(m.provenance).toEqual({ kind: 'nutzer' })
    })

    it('adds a further certificate whose social insurance is unreadable: wage and tax add up, the SV sum stands (ADR-0083)', async () => {
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, bruttoarbeitslohn: '40000', lohnsteuer: '6000', sozialversicherung: '8000' })
      const added = await service.applyScannedValues(USER_ID, TAX_YEAR, { bruttoarbeitslohn: 900, lohnsteuer: 300, sozialversicherung: null }, { receiptId: 'beleg-3', overwriteExisting: false, addToExisting: true })
      expect(added.state).toEqual({ kind: 'vollstaendig', bruttoarbeitslohn: 40900, lohnsteuer: 6300, sozialversicherung: 8000 })
      expect(markings.all().map((m) => m.key).sort()).toEqual(['lstb.bruttoarbeitslohn', 'lstb.lohnsteuer'])
    })

    it('takes a single certificate without readable social insurance and leaves that field open', async () => {
      const taken = await service.applyScannedValues(USER_ID, TAX_YEAR, { bruttoarbeitslohn: 900, lohnsteuer: 300, sozialversicherung: null }, { receiptId: null, overwriteExisting: false })
      expect(taken.state).toMatchObject({ kind: 'unvollstaendig' })
      expect(await service.existingValues(USER_ID, TAX_YEAR)).toMatchObject({ existing: { bruttoarbeitslohn: 900, lohnsteuer: 300, sozialversicherung: null } })
    })

    it('refuses to add the same certificate twice', async () => {
      repository.seed({ userId: USER_ID, taxYear: TAX_YEAR, bruttoarbeitslohn: '54320', lohnsteuer: '9840', sozialversicherung: '10912' })
      await expect(
        service.applyScannedValues(USER_ID, TAX_YEAR, scanned, { receiptId: null, overwriteExisting: false, addToExisting: true }),
      ).rejects.toMatchObject({ code: 'LSTB_SAME_CERTIFICATE' })
      expect(await service.existingValues(USER_ID, TAX_YEAR)).toMatchObject({ existing: { bruttoarbeitslohn: 54320 } })
    })

    it('rejects implausible values (LSt or SV > Brutto) cleanly before touching persistence', async () => {
      await expect(
        service.applyScannedValues(
          USER_ID,
          TAX_YEAR,
          { bruttoarbeitslohn: 10000, lohnsteuer: 12000, sozialversicherung: 2000 },
          { receiptId: null, overwriteExisting: false },
        ),
      ).rejects.toBeInstanceOf(InvalidInputError)

      expect(await repository.findForUserAndYear(USER_ID, TAX_YEAR)).toBeNull()
    })
  })
})
