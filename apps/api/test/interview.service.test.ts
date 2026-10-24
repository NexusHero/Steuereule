// Fast, no-DB unit tier (ADR-0004): InterviewService against FakeInterviewAnswerRepository
// + FakeAuditRepository. Mirrors profile.service.test.ts/cockpit.service.test.ts.
//
// The full HTTP + real-account-session + real-Postgres proof (guard wiring, 401 for a
// guest, ciphertext at rest, TaxYear.openItems) lives in
// test/acceptance/req-015-minimal-gate.test.ts — @RequiresAccount() needs a genuine
// better-auth session, which this fast tier has no honest way to fabricate. This file
// covers the admission logic (#318 P2) and response shapes at the service layer, where
// a real Postgres round-trip buys nothing extra.
import { beforeEach, describe, expect, it } from 'vitest'
import { GATE_ACKNOWLEDGED } from '@steuereule/core'
import { AuditService } from '../src/audit/audit.service.js'
import { InvalidAnswerValueError, InterviewService, UnreachableAnswerError } from '../src/interview/interview.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'

const USER_ID = 'user-1'
const STEUERJAHR = 2026

describe('InterviewService', () => {
  let repository: FakeInterviewAnswerRepository
  let auditRepository: FakeAuditRepository
  let service: InterviewService

  beforeEach(() => {
    repository = new FakeInterviewAnswerRepository()
    auditRepository = new FakeAuditRepository()
    service = new InterviewService(repository, new AuditService(auditRepository))
  })

  describe('getState', () => {
    it('a fresh tax year opens with the job question and 3 open items, empty answers', async () => {
      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state).toEqual({ answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 3 })
    })

    it('does not append a READ audit entry when there is nothing to read yet', async () => {
      await service.getState(USER_ID, STEUERJAHR)
      expect(auditRepository.all()).toEqual([])
    })

    it('reflects stored answers into nextStep/openItems, and appends a READ audit entry', async () => {
      repository.seed(USER_ID, STEUERJAHR, { job: 'Angestellt' })

      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state).toEqual({
        answers: { job: 'Angestellt' },
        nextStep: { kind: 'question', id: 'ausland' },
        openItems: 2,
      })
      expect(auditRepository.all()).toMatchObject([{ userId: USER_ID, action: 'READ', resource: 'interview' }])
    })

    it('is scoped strictly to userId and steuerjahr — never leaks another user’s or year’s answers', async () => {
      repository.seed('someone-else', STEUERJAHR, { job: 'Selbstständig' })
      repository.seed(USER_ID, 2025, { job: 'Selbstständig' })

      const state = await service.getState(USER_ID, STEUERJAHR)

      expect(state).toEqual({ answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 3 })
    })
  })

  describe('postAnswer — #318 P2, the server’s admission check', () => {
    it('admits and persists a reachable, valid answer, returning the next step and updated openItems', async () => {
      const result = await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Angestellt' })

      expect(result).toEqual({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 })
      await expect(repository.findAllForUserAndYear(USER_ID, STEUERJAHR)).resolves.toEqual([
        { questionId: 'job', value: 'Angestellt' },
      ])
    })

    // The WRITE audit entry is appended inside the real repository's own atomic
    // transaction (mirrors ProfileRepository.upsert — see
    // PrismaInterviewAnswerRepository.write's comment), not by InterviewService/
    // AuditService here, so FakeInterviewAnswerRepository has nothing to assert at
    // this tier. Proven against real Postgres in
    // test/acceptance/req-015-minimal-gate.test.ts instead.

    it('REJECTS an answer for a step not yet reached (409) and writes nothing', async () => {
      // No `job` answered yet — `ausland` was never offered.
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ausland', value: 'Nein' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)

      await expect(repository.findAllForUserAndYear(USER_ID, STEUERJAHR)).resolves.toEqual([])
      expect(repository.writes).toEqual([])
      expect(auditRepository.all()).toEqual([])
    })

    it('REJECTS a value outside the accepted set for a reachable step (400) and writes nothing', async () => {
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Freiberuflich' }),
      ).rejects.toBeInstanceOf(InvalidAnswerValueError)

      expect(repository.writes).toEqual([])
    })

    it('REJECTS an entirely unknown questionId (409 — never reachable) and writes nothing', async () => {
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'not-a-real-step', value: 'anything' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)

      expect(repository.writes).toEqual([])
    })

    it('REJECTS everything behind a terminal gate, even the acknowledged gate itself again', async () => {
      repository.seed(USER_ID, STEUERJAHR, { job: 'Selbstständig', gewerbe: GATE_ACKNOWLEDGED })

      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ausland', value: 'Nein' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'kinder', value: 'Nein' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)

      expect(repository.writes).toEqual([])
    })

    it('admits the Gewerbe gate acknowledgement for a self-employed answer, and it stays a full stop after', async () => {
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Selbstständig' })

      const acknowledged = await service.postAnswer(USER_ID, STEUERJAHR, {
        questionId: 'gewerbe',
        value: GATE_ACKNOWLEDGED,
      })
      // Still the gate — a terminal gate is returned forever (ADR-0033).
      expect(acknowledged).toEqual({ nextStep: { kind: 'gate', id: 'gewerbe' }, openItems: 0 })

      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ausland', value: 'Nein' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)
    })

    it('“Beides” passes the Gewerbe gate and continues to the rest of the interview', async () => {
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Beides' })
      const acknowledged = await service.postAnswer(USER_ID, STEUERJAHR, {
        questionId: 'gewerbe',
        value: GATE_ACKNOWLEDGED,
      })
      expect(acknowledged).toEqual({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 })

      const result = await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ausland', value: 'Nein' })
      expect(result).toEqual({ nextStep: { kind: 'question', id: 'kinder' }, openItems: 1 })
    })

    it('the CH-only gate opens on “In ein anderes Land” and, once acknowledged, carries on to kinder', async () => {
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Angestellt' })
      const gate = await service.postAnswer(USER_ID, STEUERJAHR, {
        questionId: 'ausland',
        value: 'In ein anderes Land',
      })
      expect(gate).toEqual({ nextStep: { kind: 'gate', id: 'ch-only' }, openItems: 1 })

      const acknowledged = await service.postAnswer(USER_ID, STEUERJAHR, {
        questionId: 'ch-only',
        value: GATE_ACKNOWLEDGED,
      })
      expect(acknowledged).toEqual({ nextStep: { kind: 'question', id: 'kinder' }, openItems: 1 })
    })

    it('re-answering an already-answered, still-reachable question is idempotent (back navigation)', async () => {
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Angestellt' })
      const result = await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Rente' })

      expect(result).toEqual({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 })
      await expect(repository.findAllForUserAndYear(USER_ID, STEUERJAHR)).resolves.toEqual([
        { questionId: 'job', value: 'Rente' },
      ])
    })

    it('answering all three questions reaches done, with openItems 0', async () => {
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'job', value: 'Angestellt' })
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ausland', value: 'Nein' })
      const result = await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'kinder', value: 'Nein' })

      expect(result).toEqual({ nextStep: { kind: 'done' }, openItems: 0 })
    })

    it('is scoped strictly to userId — one user’s answers never admit another’s path', async () => {
      repository.seed('someone-else', STEUERJAHR, { job: 'Angestellt' })

      // USER_ID has answered nothing, so `ausland` must still be unreachable for them,
      // even though "someone-else" has already answered `job`.
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ausland', value: 'Nein' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)
    })
  })

  describe('postAnswer — Grenzgänger-CH entry (segment-ch, ADR-013/036) on the same engine', () => {
    it('admits ch-wohnsitz as the CH entry’s first question and returns the CH next step, without touching the Minimal-Gate’s openItems', async () => {
      const result = await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ch-wohnsitz', value: 'Deutschland' })

      // Entry-scoped openItems (union with ticket 08's semantics): 1 of 2 segment-ch questions
      // answered → 1 remaining. The Minimal-Gate's own count stays untouched (see the repository
      // write below — openItems is the Minimal-Gate projection, unchanged by CH answers).
      expect(result).toEqual({ nextStep: { kind: 'question', id: 'ch-nichtrueckkehrtage' }, openItems: 1 })
      await expect(repository.findAllForUserAndYear(USER_ID, STEUERJAHR)).resolves.toEqual([
        { questionId: 'ch-wohnsitz', value: 'Deutschland' },
      ])
    })

    it('rejects (409) ch-nichtrueckkehrtage before ch-wohnsitz is answered — order is enforced, not just client-shown', async () => {
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ch-nichtrueckkehrtage', value: '20' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)

      expect(repository.writes).toEqual([])
    })

    it('rejects (400) a value outside the accepted set for ch-wohnsitz', async () => {
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ch-wohnsitz', value: 'Frankreich' }),
      ).rejects.toBeInstanceOf(InvalidAnswerValueError)

      expect(repository.writes).toEqual([])
    })

    it('rejects (400) a non-integer for ch-nichtrueckkehrtage (its integer form, D5)', async () => {
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ch-wohnsitz', value: 'Deutschland' })
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ch-nichtrueckkehrtage', value: 'sieben' }),
      ).rejects.toBeInstanceOf(InvalidAnswerValueError)
    })

    it('the CH entry reaches done after both answers, independent of the Minimal-Gate', async () => {
      await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ch-wohnsitz', value: 'Schweiz' })
      const result = await service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'ch-nichtrueckkehrtage', value: '0' })

      expect(result).toEqual({ nextStep: { kind: 'done' }, openItems: 0 })
      await expect(repository.findAllForUserAndYear(USER_ID, STEUERJAHR)).resolves.toEqual([
        { questionId: 'ch-wohnsitz', value: 'Schweiz' },
        { questionId: 'ch-nichtrueckkehrtage', value: '0' },
      ])
    })
  })

  describe('postAnswer — Segment 2 stays NOT admitted server-side (the allowlist, not `entryForStep`)', () => {
    // `entryForStep` is generic over every entry in core, so WITHOUT the ADMITTED_ENTRY_IDS
    // allowlist a Segment-2 id would slip through on the same endpoint. This pins the actual
    // admission boundary: Segment 2 remains "declared, not yet admitted server-side — that is
    // R2's job" (packages/core/src/interview.ts header), refused here with 409 and no row write.
    it('rejects (409) a Segment-2 id (partner) and writes nothing', async () => {
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'partner', value: 'Ja' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)

      expect(repository.writes).toEqual([])
      await expect(repository.findAllForUserAndYear(USER_ID, STEUERJAHR)).resolves.toEqual([])
    })

    it('rejects (409) a Segment-2 follow-up id (kap-depot) and writes nothing', async () => {
      await expect(
        service.postAnswer(USER_ID, STEUERJAHR, { questionId: 'kap-depot', value: 'Krypto' }),
      ).rejects.toBeInstanceOf(UnreachableAnswerError)

      expect(repository.writes).toEqual([])
    })
  })
})
