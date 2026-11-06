// Fast, no-DB unit tier (ADR-0004): VermietungService against FakeVermietungRepository +
// FakeInterviewAnswerRepository + FakeAuditRepository. Mirrors rente.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real fold
// through Prisma) lives in test/acceptance/req-026-vermietung.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeMarkingRepository } from './fakes/fake-kennzeichnung.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { RentalService } from '../src/vermietung/vermietung.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeRentalRepository } from './fakes/fake-vermietung.repository.js'

const USER_ID = 'user-1'
const TAX_YEAR = 2026

describe('VermietungService', () => {
  let markings: FakeMarkingRepository
  let repository: FakeRentalRepository
  let interviewRepository: FakeInterviewAnswerRepository
  let auditRepository: FakeAuditRepository
  let service: RentalService

  beforeEach(() => {
    repository = new FakeRentalRepository()
    interviewRepository = new FakeInterviewAnswerRepository()
    auditRepository = new FakeAuditRepository()
    markings = new FakeMarkingRepository()
    service = new RentalService(repository, interviewRepository, new AuditService(auditRepository), markings)
  })

  describe('getState — the honest empty state and the Einordnung', () => {
    it('a fresh tax year returns no objects, einordnung unbekannt, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, TAX_YEAR)

      expect(state.classification).toEqual({ kind: 'unbekannt' })
      expect(state.properties).toEqual([])
      expect(state.status).toMatchObject({ kind: 'bestimmt', einnahmen: 0, werbungskosten: 0, depreciation: 0, openItems: 0 })
      expect(auditRepository.all()).toEqual([])
    })

    it('derives the Einordnung from the stored vermietung-art answer — never a column of its own', async () => {
      interviewRepository.seed(USER_ID, TAX_YEAR, { 'vermietung-art': 'Mehrere' })

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.classification).toEqual({ kind: 'mehrere' })
    })
  })

  describe('createObjekt + setFeld — the guided mask over several objects', () => {
    it('creates a fresh object with every field offen', async () => {
      const state = await service.createProperty(USER_ID, TAX_YEAR)

      expect(state.properties).toHaveLength(1)
      expect(state.properties[0]).toMatchObject({
        mieteinnahmen: { kind: 'offen' },
        anschaffungskosten: { kind: 'offen' },
        baujahr: { kind: 'offen' },
        werbungskosten: { kind: 'offen' },
        facts: { einnahmen: null, werbungskosten: null, depreciation: null, openItems: 3 },
      })
      // The WRITE audit entry is the REAL repository's job (atomic with the upsert, REQ-004) —
      // proven in the acceptance tier against real Prisma, not by this fake.
    })

    it('re-entry appends a READ audit entry once there is something to access', async () => {
      await service.createProperty(USER_ID, TAX_YEAR)

      await service.getState(USER_ID, TAX_YEAR)
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'vermietung' }])
    })

    it('a complete object folds through the core: Mieteinnahmen, Werbungskosten and the § 7 Abs. 4 AfA', async () => {
      const created = await service.createProperty(USER_ID, TAX_YEAR)
      const propertyId = created.properties[0]!.id
      await service.setField(USER_ID, TAX_YEAR, propertyId, 'mieteinnahmen', { kind: 'erfasst', value: 12000 })
      await service.setField(USER_ID, TAX_YEAR, propertyId, 'anschaffungskosten', { kind: 'erfasst', value: 200000 })
      await service.setField(USER_ID, TAX_YEAR, propertyId, 'baujahr', { kind: 'erfasst', value: 1990 })
      const state = await service.setField(USER_ID, TAX_YEAR, propertyId, 'werbungskosten', { kind: 'erfasst', value: 1500 })

      expect(state.properties[0]?.facts).toEqual({
        einnahmen: 12000,
        werbungskosten: 1500,
        depreciation: { amount: 4000, provenance: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' },
        openItems: 0,
      })
      expect(state.status).toEqual({
        kind: 'bestimmt',
        einnahmen: 12000,
        vorsorgeaufwand: 0,
        anrechnung: 0,
        werbungskosten: 1500,
        depreciation: 4000,
        openItems: 0,
        conflicts: 0,
      })
    })

    it('several objects sum separately — je Objekt eine Anlage V', async () => {
      const created = await service.createProperty(USER_ID, TAX_YEAR)
      const a = created.properties[0]!.id
      const created2 = await service.createProperty(USER_ID, TAX_YEAR)
      const b = created2.properties[1]!.id
      for (const [id, rent] of [[a, 12000], [b, 6000]] as const) {
        await service.setField(USER_ID, TAX_YEAR, id, 'mieteinnahmen', { kind: 'erfasst', value: rent })
        await service.setField(USER_ID, TAX_YEAR, id, 'anschaffungskosten', { kind: 'erfasst', value: 200000 })
        await service.setField(USER_ID, TAX_YEAR, id, 'baujahr', { kind: 'erfasst', value: 1990 })
        await service.setField(USER_ID, TAX_YEAR, id, 'werbungskosten', { kind: 'erfasst', value: 0 })
      }

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.status).toMatchObject({ kind: 'bestimmt', einnahmen: 18000, depreciation: 8000, openItems: 0 })
    })

    it('an incomplete object keeps the fold offen — never a guessed zero', async () => {
      const created = await service.createProperty(USER_ID, TAX_YEAR)
      const propertyId = created.properties[0]!.id
      await service.setField(USER_ID, TAX_YEAR, propertyId, 'mieteinnahmen', { kind: 'erfasst', value: 12000 })

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.status.kind).toBe('offen')
      if (state.status.kind === 'offen') expect(state.status.openItems).toBe(2)
    })

    it('rejects an erfasst without a valid amount (400) and an unknown objektId (404)', async () => {
      const created = await service.createProperty(USER_ID, TAX_YEAR)
      const propertyId = created.properties[0]!.id

      await expect(service.setField(USER_ID, TAX_YEAR, propertyId, 'baujahr', { kind: 'erfasst' })).rejects.toThrow('requires a non-negative integer')
      await expect(service.setField(USER_ID, TAX_YEAR, 'someone-elses-id', 'baujahr', { kind: 'offen' })).rejects.toThrow('No such Vermietungsobjekt')
    })

    it('a Verkauf/möbliert-Anleger reads offen with the gate named (ADR-033)', async () => {
      interviewRepository.seed(USER_ID, TAX_YEAR, { einkuenfte: 'Vermietung', 'vermietung-art': 'Verkauf oder möbliert' })

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.classification).toEqual({ kind: 'verkauf-oder-moebliert' })
      expect(state.status).toMatchObject({ kind: 'offen', gated: ['Vermietung'] })
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      await service.createProperty('someone-else', TAX_YEAR)

      const state = await service.getState(USER_ID, TAX_YEAR)
      expect(state.properties).toEqual([])
    })
  })

  it('ADR-0052 §6: a user write drops the marker of exactly that field of that object', async () => {
    const property = await repository.create('user-1', 2025)
    await markings.save('user-1', 2025, { key: `vermietung:${property.id}.mieteinnahmen`, provenance: { kind: 'uebernahme', lastYear: 2024 }, confirmed: false, proposal: null })
    await markings.save('user-1', 2025, { key: `vermietung:${property.id}.baujahr`, provenance: { kind: 'uebernahme', lastYear: 2024 }, confirmed: false, proposal: null })

    await service.setField('user-1', 2025, property.id, 'mieteinnahmen', { kind: 'erfasst', value: 9000 })

    expect(markings.all().map((k) => k.key)).toEqual([`vermietung:${property.id}.baujahr`])
  })
})
