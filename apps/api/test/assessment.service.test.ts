// Fast, no-DB unit tier (ADR-0004): BescheidService against the fake repositories. Mirrors
// beleg.service.test.ts. The full real-Postgres proof (ciphertext at rest, audit atomicity,
// cross-user isolation, the real Abgleich through the computed stand) lives in
// bescheid.integration.test.ts and the acceptance tier (req-023-bescheidpruefung.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { AssessmentService, todayIso } from '../src/assessment/assessment.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'

const USER_ID = 'user-1'
const YEAR = 2026

describe('BescheidService', () => {
  let repository: FakeAssessmentRepository
  let lstb: FakeLstbRepository
  let interview: FakeInterviewAnswerRepository
  let ch: FakeChSalaryCertificateRepository
  let auditRepository: FakeAuditRepository
  let service: AssessmentService

  beforeEach(() => {
    repository = new FakeAssessmentRepository()
    lstb = new FakeLstbRepository()
    interview = new FakeInterviewAnswerRepository()
    ch = new FakeChSalaryCertificateRepository()
    auditRepository = new FakeAuditRepository()
    service = new AssessmentService(repository, lstb, interview, ch, new AuditService(auditRepository))
  })

  /** Seed a computed side of 50.000 € Einnahmen (Angestellt) so the Abgleich has a counterpart. */
  function seedEmployeeIncome(gross: number) {
    lstb.seed({ userId: USER_ID, taxYear: YEAR, bruttoarbeitslohn: String(gross), lohnsteuer: '9000', sozialversicherung: '10000' })
    interview.seed(USER_ID, YEAR, { job: 'Angestellt' })
  }

  describe('getState — re-entry', () => {
    it('a fresh year reads as eingegangen, all fields offen, no frist, empty abgleich', async () => {
      const state = await service.getState(USER_ID, YEAR)
      expect(state.status).toBe('eingegangen')
      expect(state.assessmentDate).toBeNull()
      expect(state.appealReason).toBeNull()
      expect(state.fields.map((f) => f.kind)).toEqual(['offen', 'offen', 'offen', 'offen', 'offen'])
      expect(state.reconciliation.deviations).toEqual([])
      expect(state.frist.deadlineEnd).toBeNull()
      expect(state.nextStates).toEqual(['geprüft'])
      expect(auditRepository.all()).toEqual([]) // no READ entry on an unstarted mask
    })
  })

  describe('setFeld — the guided mask, with a derived Abgleich (nie still)', () => {
    it('an erfasst figure that deviates from the computed stand is a named diff', async () => {
      seedEmployeeIncome(50_000)
      const state = await service.setField(USER_ID, YEAR, 'einnahmen', { kind: 'erfasst', value: 48_000 })

      expect(state.fields[0]).toEqual({ id: 'einnahmen', kind: 'erfasst', value: 48_000 })
      expect(state.reconciliation.deviations).toEqual([
        { field: 'einnahmen', assessment: 48_000, calculated: 50_000, difference: -2_000 },
      ])
    })

    it('a matching figure produces no deviation', async () => {
      seedEmployeeIncome(50_000)
      const state = await service.setField(USER_ID, YEAR, 'einnahmen', { kind: 'erfasst', value: 50_000 })
      expect(state.reconciliation.deviations).toEqual([])
    })

    it('unklar is stored honestly, never guessed', async () => {
      const state = await service.setField(USER_ID, YEAR, 'festgesetzteSteuer', { kind: 'unklar' })
      expect(state.fields[3]).toEqual({ id: 'festgesetzteSteuer', kind: 'unklar' })
    })

    it('a negative amount on a non-signed field is rejected', async () => {
      await expect(service.setField(USER_ID, YEAR, 'einnahmen', { kind: 'erfasst', value: -1 })).rejects.toThrow(/valid whole-euro/)
    })
  })

  describe('setDatum — the § 355 AO Frist', () => {
    it('sets the Bescheiddatum and derives the frist end (one month after the notice counts as received: So 15.03. + 4 = Do 19.03., So 19.04. → Mo 20.04.)', async () => {
      const state = await service.setDate(USER_ID, YEAR, { date: '2026-03-15' })
      expect(state.assessmentDate).toBe('2026-03-15')
      expect(state.frist.deadlineEnd).toBe('2026-04-20')
      expect(state.frist.remainingDays).toBeTypeOf('number')
    })

    it('rejects a malformed date', async () => {
      await expect(service.setDate(USER_ID, YEAR, { date: '15.03.2026' })).rejects.toThrow(/ISO yyyy-mm-dd/)
    })
  })

  describe('setStatus — server-validated transitions (kein stiller Übergang)', () => {
    it('eingegangen → geprüft is legal', async () => {
      const state = await service.setStatus(USER_ID, YEAR, { status: 'geprüft' })
      expect(state.status).toBe('geprüft')
      expect(state.nextStates).toEqual(['einspruch-eingelegt'])
    })

    it('an illegal jump is rejected with a conflict, never coerced', async () => {
      // eingegangen → einspruch-eingelegt skips geprüft — must be rejected.
      await expect(service.setStatus(USER_ID, YEAR, { status: 'einspruch-eingelegt' })).rejects.toThrow(/illegal Bescheid transition/)
    })
  })

  describe('setEinspruch — the NACH-Bescheid flow', () => {
    it('geprüft → einspruch-eingelegt (with a Grund) is legal', async () => {
      await service.setStatus(USER_ID, YEAR, { status: 'geprüft' })
      const state = await service.setAppeal(USER_ID, YEAR, { reason: 'betrag-falsch' })
      expect(state.status).toBe('einspruch-eingelegt')
      expect(state.appealReason).toBe('betrag-falsch')
      expect(state.nextStates).toEqual([])
    })

    it('filing an Einspruch straight from eingegangen is rejected', async () => {
      await expect(service.setAppeal(USER_ID, YEAR, { reason: 'sonstiges' })).rejects.toThrow(/illegal Bescheid transition/)
    })

    it('an unknown Grund is rejected', async () => {
      await service.setStatus(USER_ID, YEAR, { status: 'geprüft' })
      await expect(service.setAppeal(USER_ID, YEAR, { reason: 'weg-damit' })).rejects.toThrow(/unknown Einspruch-Grund/)
    })
  })

  describe('cross-user isolation', () => {
    it('never leaks another user’s Bescheid', async () => {
      seedEmployeeIncome(50_000)
      await service.setField('someone-else', YEAR, 'einnahmen', { kind: 'erfasst', value: 1 })

      const mine = await service.getState(USER_ID, YEAR)
      expect(mine.fields[0]).toEqual({ id: 'einnahmen', kind: 'offen' })
    })
  })
})

describe('heuteIso — the Fristen-Countdown reference day (Europe/Berlin, not UTC)', () => {
  it('returns the Berlin calendar day for a noon instant', () => {
    // 12:00 UTC = 13:00 Berlin — the same calendar day.
    expect(todayIso(new Date('2026-01-01T12:00:00Z'))).toBe('2026-01-01')
  })

  it('rolls into the Berlin calendar day across the UTC midnight boundary', () => {
    // 23:30 UTC on 01.01 is already 00:30 on 02.01 in Berlin (CET, UTC+1). A UTC reference day
    // would still say 01.01 and under-count the Einspruchsfrist by one day.
    expect(todayIso(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02')
  })
})
