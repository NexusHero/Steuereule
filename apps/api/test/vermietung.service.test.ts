// Fast, no-DB unit tier (ADR-0004): VermietungService against FakeVermietungRepository +
// FakeInterviewAnswerRepository + FakeAuditRepository. Mirrors rente.service.test.ts. The full
// real-Postgres proof (ciphertext at rest, audit atomicity, cross-user isolation, the real fold
// through Prisma) lives in test/acceptance/req-026-vermietung.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { VermietungService } from '../src/vermietung/vermietung.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeVermietungRepository } from './fakes/fake-vermietung.repository.js'

const USER_ID = 'user-1'
const STEUERJAHR = 2026

describe('VermietungService', () => {
  let repository: FakeVermietungRepository
  let interviewRepository: FakeInterviewAnswerRepository
  let auditRepository: FakeAuditRepository
  let service: VermietungService

  beforeEach(() => {
    repository = new FakeVermietungRepository()
    interviewRepository = new FakeInterviewAnswerRepository()
    auditRepository = new FakeAuditRepository()
    service = new VermietungService(repository, interviewRepository, new AuditService(auditRepository))
  })

  describe('getState — the honest empty state and the Einordnung', () => {
    it('a fresh tax year returns no objects, einordnung unbekannt, no READ audit entry', async () => {
      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state.einordnung).toEqual({ kind: 'unbekannt' })
      expect(state.objekte).toEqual([])
      expect(state.stand).toMatchObject({ kind: 'bestimmt', einnahmen: 0, werbungskosten: 0, afa: 0, offenePosten: 0 })
      expect(auditRepository.all()).toEqual([])
    })

    it('derives the Einordnung from the stored vermietung-art answer — never a column of its own', async () => {
      interviewRepository.seed(USER_ID, STEUERJAHR, { 'vermietung-art': 'Mehrere' })

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.einordnung).toEqual({ kind: 'mehrere' })
    })
  })

  describe('createObjekt + setFeld — the guided mask over several objects', () => {
    it('creates a fresh object with every field offen', async () => {
      const state = await service.createObjekt(USER_ID, STEUERJAHR)

      expect(state.objekte).toHaveLength(1)
      expect(state.objekte[0]).toMatchObject({
        mieteinnahmen: { kind: 'offen' },
        anschaffungskosten: { kind: 'offen' },
        baujahr: { kind: 'offen' },
        werbungskosten: { kind: 'offen' },
        fakten: { einnahmen: null, werbungskosten: null, afa: null, offenePosten: 3 },
      })
      // The WRITE audit entry is the REAL repository's job (atomic with the upsert, REQ-004) —
      // proven in the acceptance tier against real Prisma, not by this fake.
    })

    it('re-entry appends a READ audit entry once there is something to access', async () => {
      await service.createObjekt(USER_ID, STEUERJAHR)

      await service.getState(USER_ID, STEUERJAHR)
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'vermietung' }])
    })

    it('a complete object folds through the core: Mieteinnahmen, Werbungskosten and the § 7 Abs. 4 AfA', async () => {
      const created = await service.createObjekt(USER_ID, STEUERJAHR)
      const objektId = created.objekte[0]!.id
      await service.setFeld(USER_ID, STEUERJAHR, objektId, 'mieteinnahmen', { kind: 'erfasst', wert: 12000 })
      await service.setFeld(USER_ID, STEUERJAHR, objektId, 'anschaffungskosten', { kind: 'erfasst', wert: 200000 })
      await service.setFeld(USER_ID, STEUERJAHR, objektId, 'baujahr', { kind: 'erfasst', wert: 1990 })
      const state = await service.setFeld(USER_ID, STEUERJAHR, objektId, 'werbungskosten', { kind: 'erfasst', wert: 1500 })

      expect(state.objekte[0]?.fakten).toEqual({
        einnahmen: 12000,
        werbungskosten: 1500,
        afa: { betrag: 4000, herkunft: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' },
        offenePosten: 0,
      })
      expect(state.stand).toEqual({
        kind: 'bestimmt',
        einnahmen: 12000,
        vorsorgeaufwand: 0,
        anrechnung: 0,
        werbungskosten: 1500,
        afa: 4000,
        offenePosten: 0,
        konflikte: 0,
      })
    })

    it('several objects sum separately — je Objekt eine Anlage V', async () => {
      const created = await service.createObjekt(USER_ID, STEUERJAHR)
      const a = created.objekte[0]!.id
      const created2 = await service.createObjekt(USER_ID, STEUERJAHR)
      const b = created2.objekte[1]!.id
      for (const [id, miete] of [[a, 12000], [b, 6000]] as const) {
        await service.setFeld(USER_ID, STEUERJAHR, id, 'mieteinnahmen', { kind: 'erfasst', wert: miete })
        await service.setFeld(USER_ID, STEUERJAHR, id, 'anschaffungskosten', { kind: 'erfasst', wert: 200000 })
        await service.setFeld(USER_ID, STEUERJAHR, id, 'baujahr', { kind: 'erfasst', wert: 1990 })
        await service.setFeld(USER_ID, STEUERJAHR, id, 'werbungskosten', { kind: 'erfasst', wert: 0 })
      }

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.stand).toMatchObject({ kind: 'bestimmt', einnahmen: 18000, afa: 8000, offenePosten: 0 })
    })

    it('an incomplete object keeps the fold offen — never a guessed zero', async () => {
      const created = await service.createObjekt(USER_ID, STEUERJAHR)
      const objektId = created.objekte[0]!.id
      await service.setFeld(USER_ID, STEUERJAHR, objektId, 'mieteinnahmen', { kind: 'erfasst', wert: 12000 })

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.stand.kind).toBe('offen')
      if (state.stand.kind === 'offen') expect(state.stand.offenePosten).toBe(2)
    })

    it('rejects an erfasst without a valid amount (400) and an unknown objektId (404)', async () => {
      const created = await service.createObjekt(USER_ID, STEUERJAHR)
      const objektId = created.objekte[0]!.id

      await expect(service.setFeld(USER_ID, STEUERJAHR, objektId, 'baujahr', { kind: 'erfasst' })).rejects.toThrow('requires a non-negative integer')
      await expect(service.setFeld(USER_ID, STEUERJAHR, 'someone-elses-id', 'baujahr', { kind: 'offen' })).rejects.toThrow('No such Vermietungsobjekt')
    })

    it('a Verkauf/möbliert-Anleger reads offen with the gate named (ADR-033)', async () => {
      interviewRepository.seed(USER_ID, STEUERJAHR, { einkuenfte: 'Vermietung', 'vermietung-art': 'Verkauf oder möbliert' })

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.einordnung).toEqual({ kind: 'verkauf-oder-moebliert' })
      expect(state.stand).toMatchObject({ kind: 'offen', gegated: ['Vermietung'] })
    })

    it('is scoped strictly to userId and steuerjahr', async () => {
      await service.createObjekt('someone-else', STEUERJAHR)

      const state = await service.getState(USER_ID, STEUERJAHR)
      expect(state.objekte).toEqual([])
    })
  })
})
