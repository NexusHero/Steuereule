// Fast, no-DB unit tier (ADR-0004): BescheidService against the fake repositories. Mirrors
// beleg.service.test.ts. The full real-Postgres proof (ciphertext at rest, audit atomicity,
// cross-user isolation, the real Abgleich through the computed stand) lives in
// bescheid.integration.test.ts and the acceptance tier (req-023-bescheidpruefung.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service.js'
import { BescheidService, heuteIso } from '../src/bescheid/bescheid.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeBescheidRepository } from './fakes/fake-bescheid.repository.js'
import { FakeChLohnausweisRepository } from './fakes/fake-ch-lohnausweis.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'

const USER_ID = 'user-1'
const JAHR = 2026

describe('BescheidService', () => {
  let repository: FakeBescheidRepository
  let lstb: FakeLstbRepository
  let interview: FakeInterviewAnswerRepository
  let ch: FakeChLohnausweisRepository
  let auditRepository: FakeAuditRepository
  let service: BescheidService

  beforeEach(() => {
    repository = new FakeBescheidRepository()
    lstb = new FakeLstbRepository()
    interview = new FakeInterviewAnswerRepository()
    ch = new FakeChLohnausweisRepository()
    auditRepository = new FakeAuditRepository()
    service = new BescheidService(repository, lstb, interview, ch, new AuditService(auditRepository))
  })

  /** Seed a computed side of 50.000 € Einnahmen (Angestellt) so the Abgleich has a counterpart. */
  function seedAngestelltenEinnahmen(brutto: number) {
    lstb.seed({ userId: USER_ID, steuerjahr: JAHR, bruttoarbeitslohn: String(brutto), lohnsteuer: '9000', sozialversicherung: '10000' })
    interview.seed(USER_ID, JAHR, { job: 'Angestellt' })
  }

  describe('getState — re-entry', () => {
    it('a fresh year reads as eingegangen, all fields offen, no frist, empty abgleich', async () => {
      const state = await service.getState(USER_ID, JAHR)
      expect(state.status).toBe('eingegangen')
      expect(state.bescheiddatum).toBeNull()
      expect(state.einspruchGrund).toBeNull()
      expect(state.felder.map((f) => f.kind)).toEqual(['offen', 'offen', 'offen', 'offen', 'offen'])
      expect(state.abgleich.abweichungen).toEqual([])
      expect(state.frist.fristEnde).toBeNull()
      expect(state.naechsteZustaende).toEqual(['geprüft'])
      expect(auditRepository.all()).toEqual([]) // no READ entry on an unstarted mask
    })
  })

  describe('setFeld — the guided mask, with a derived Abgleich (nie still)', () => {
    it('an erfasst figure that deviates from the computed stand is a named diff', async () => {
      seedAngestelltenEinnahmen(50_000)
      const state = await service.setFeld(USER_ID, JAHR, 'einnahmen', { kind: 'erfasst', wert: 48_000 })

      expect(state.felder[0]).toEqual({ id: 'einnahmen', kind: 'erfasst', wert: 48_000 })
      expect(state.abgleich.abweichungen).toEqual([
        { feld: 'einnahmen', bescheid: 48_000, berechnet: 50_000, differenz: -2_000 },
      ])
    })

    it('a matching figure produces no deviation', async () => {
      seedAngestelltenEinnahmen(50_000)
      const state = await service.setFeld(USER_ID, JAHR, 'einnahmen', { kind: 'erfasst', wert: 50_000 })
      expect(state.abgleich.abweichungen).toEqual([])
    })

    it('unklar is stored honestly, never guessed', async () => {
      const state = await service.setFeld(USER_ID, JAHR, 'festgesetzteSteuer', { kind: 'unklar' })
      expect(state.felder[3]).toEqual({ id: 'festgesetzteSteuer', kind: 'unklar' })
    })

    it('a negative amount on a non-signed field is rejected', async () => {
      await expect(service.setFeld(USER_ID, JAHR, 'einnahmen', { kind: 'erfasst', wert: -1 })).rejects.toThrow(/valid whole-euro/)
    })
  })

  describe('setDatum — the § 355 AO Frist', () => {
    it('sets the Bescheiddatum and derives the frist end (Bescheiddatum + 1 Monat)', async () => {
      const state = await service.setDatum(USER_ID, JAHR, { datum: '2026-03-15' })
      expect(state.bescheiddatum).toBe('2026-03-15')
      expect(state.frist.fristEnde).toBe('2026-04-15')
      expect(state.frist.verbleibendeTage).toBeTypeOf('number')
    })

    it('rejects a malformed date', async () => {
      await expect(service.setDatum(USER_ID, JAHR, { datum: '15.03.2026' })).rejects.toThrow(/ISO yyyy-mm-dd/)
    })
  })

  describe('setStatus — server-validated transitions (kein stiller Übergang)', () => {
    it('eingegangen → geprüft is legal', async () => {
      const state = await service.setStatus(USER_ID, JAHR, { status: 'geprüft' })
      expect(state.status).toBe('geprüft')
      expect(state.naechsteZustaende).toEqual(['einspruch-eingelegt'])
    })

    it('an illegal jump is rejected with a conflict, never coerced', async () => {
      // eingegangen → einspruch-eingelegt skips geprüft — must be rejected.
      await expect(service.setStatus(USER_ID, JAHR, { status: 'einspruch-eingelegt' })).rejects.toThrow(/illegal Bescheid transition/)
    })
  })

  describe('setEinspruch — the NACH-Bescheid flow', () => {
    it('geprüft → einspruch-eingelegt (with a Grund) is legal', async () => {
      await service.setStatus(USER_ID, JAHR, { status: 'geprüft' })
      const state = await service.setEinspruch(USER_ID, JAHR, { grund: 'betrag-falsch' })
      expect(state.status).toBe('einspruch-eingelegt')
      expect(state.einspruchGrund).toBe('betrag-falsch')
      expect(state.naechsteZustaende).toEqual([])
    })

    it('filing an Einspruch straight from eingegangen is rejected', async () => {
      await expect(service.setEinspruch(USER_ID, JAHR, { grund: 'sonstiges' })).rejects.toThrow(/illegal Bescheid transition/)
    })

    it('an unknown Grund is rejected', async () => {
      await service.setStatus(USER_ID, JAHR, { status: 'geprüft' })
      await expect(service.setEinspruch(USER_ID, JAHR, { grund: 'weg-damit' })).rejects.toThrow(/unknown Einspruch-Grund/)
    })
  })

  describe('cross-user isolation', () => {
    it('never leaks another user’s Bescheid', async () => {
      seedAngestelltenEinnahmen(50_000)
      await service.setFeld('someone-else', JAHR, 'einnahmen', { kind: 'erfasst', wert: 1 })

      const mine = await service.getState(USER_ID, JAHR)
      expect(mine.felder[0]).toEqual({ id: 'einnahmen', kind: 'offen' })
    })
  })
})

describe('heuteIso — the Fristen-Countdown reference day (Europe/Berlin, not UTC)', () => {
  it('returns the Berlin calendar day for a noon instant', () => {
    // 12:00 UTC = 13:00 Berlin — the same calendar day.
    expect(heuteIso(new Date('2026-01-01T12:00:00Z'))).toBe('2026-01-01')
  })

  it('rolls into the Berlin calendar day across the UTC midnight boundary', () => {
    // 23:30 UTC on 01.01 is already 00:30 on 02.01 in Berlin (CET, UTC+1). A UTC reference day
    // would still say 01.01 and under-count the Einspruchsfrist by one day.
    expect(heuteIso(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02')
  })
})
