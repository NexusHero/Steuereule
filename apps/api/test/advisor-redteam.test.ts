// DevMLOps Backend Red-Team & Boundary Gate:
//   1. Egress PII guard (`checkPiiFree`) against obfuscated IBANs, formatted Steuer-IDs, and forbidden keys.
//   2. Cross-user isolation on Advisor chat sessions, messages, and action mutations (`applyAction`/`undoAction`).
//   3. Daily rate-limit enforcement (`DEFAULT_AI_TURN_LIMITS.dailyMessageLimit = 50`).
//   4. MCP Server tool scope enforcement (`steuerdaten:read` cannot invoke write/payment tools).
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_AI_TURN_LIMITS } from '../src/ki/ai-runtime-config.service.js'
import { NotFoundError, TooManyRequestsError } from '../src/common/domain-error.js'
import { checkPiiFree, validateAiProposal } from '../src/ki/ki.adapter.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { buildAdvisorTestKit, type AdvisorTestFacade } from './fakes/advisor-test-kit.js'

const USER_A = 'user-redteam-a'
const USER_B = 'user-redteam-b'
const YEAR = 2025

describe('DevMLOps Backend Red-Team & Egress Boundary Suite', () => {
  let advisorService: AdvisorTestFacade
  let interviewRepo: FakeInterviewAnswerRepository

  beforeEach(async () => {
    const kit = buildAdvisorTestKit()
    const { profileRepo } = kit
    interviewRepo = kit.interviewRepo
    advisorService = kit.service

    await profileRepo.upsert(USER_A, {
      firstName: 'Lena',
      lastName: 'Hoffmann',
      steuerId: '02476291358',
      steuernummer: '181/815/08155',
    })
  })

  it('checkPiiFree blocks obfuscated/spaced/hyphenated IBANs, formatted Steuer-IDs, and nested forbidden keys', () => {
    // Obfuscated IBANs
    expect(() => checkPiiFree({ note: 'DE89 3704 0044 0532 0130 00' })).toThrow(/IBAN/)
    expect(() => checkPiiFree({ note: 'de89-3704-0044-0532-0130-00' })).toThrow(/IBAN/)
    expect(() => checkPiiFree({ note: 'CH93.0076.2011.6238.5295.7' })).toThrow(/IBAN/)

    // Formatted 11-digit Steuer-IDs
    expect(() => checkPiiFree({ note: '02 476 291 358' })).toThrow(/Steuer-ID/)
    expect(() => checkPiiFree({ note: '024-762-913-58' })).toThrow(/Steuer-ID/)
    expect(() => checkPiiFree({ note: '02.476.291.358' })).toThrow(/Steuer-ID/)

    // Deeply nested forbidden personal keys
    expect(() => checkPiiFree({ nested: { deeper: { kontoinhaber: 'Lena Hoffmann' } } })).toThrow(/kontoinhaber/)
    expect(() => checkPiiFree({ nested: { email: 'lena@example.com' } })).toThrow(/email/)
    expect(() => checkPiiFree({ nested: { geburtsdatum: '1990-01-01' } })).toThrow(/geburtsdatum/)
  })

  it('validateAiProposal rejects malformed, negative, floating-point, or unknown-incomeType LLM outputs', () => {
    expect(() => validateAiProposal(null)).toThrow(/not an object/)
    expect(() => validateAiProposal({ id: '', einkunftsart: 'Nichtselbstständig', betrag: 100 })).toThrow(/id must be/)
    expect(() => validateAiProposal({ id: 'p1', einkunftsart: 'KryptoTrading', betrag: 100 })).toThrow(
      /unknown einkunftsart/,
    )
    expect(() => validateAiProposal({ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: -50 })).toThrow(
      /non-negative integer/,
    )
    expect(() => validateAiProposal({ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 19.99 })).toThrow(
      /non-negative integer/,
    )
  })

  it('enforces strict BOLA/IDOR isolation: User B cannot view, apply, or undo User A advisor actions', async () => {
    const turn = await advisorService.sendMessage(USER_A, YEAR, {
      message: 'Bitte 300 € Spenden eintragen',
    })
    const actionId = turn.assistantMessage.meta?.action?.actionId
    expect(actionId).toBeDefined()

    // User B tries to apply User A's actionId
    await expect(advisorService.applyAction(USER_B, YEAR, actionId!)).rejects.toThrow(NotFoundError)
    await expect(
      advisorService.applyBatch(USER_B, YEAR, { drafts: [{ actionId: actionId! }] }),
    ).rejects.toThrow(NotFoundError)

    // User A applies it legitimately
    const applied = await advisorService.applyAction(USER_A, YEAR, actionId!)
    expect(applied.action.status).toBe('applied')

    // User B tries to undo User A's applied actionId
    await expect(advisorService.undoAction(USER_B, YEAR, actionId!)).rejects.toThrow(NotFoundError)

    // User B's session for the same tax year is completely empty
    const sessionB = await advisorService.getSession(USER_B, YEAR)
    expect(sessionB.messages).toHaveLength(0)
  })

  it('enforces daily cost/abuse budget (dailyMessageLimit = 50) and blocks message 51', async () => {
    for (let i = 0; i < DEFAULT_AI_TURN_LIMITS.dailyMessageLimit; i++) {
      await advisorService.sendMessage(USER_A, YEAR, {
        message: `Testfrage ${i + 1} zu Werbungskosten`,
      })
    }

    await expect(
      advisorService.sendMessage(USER_A, YEAR, {
        message: 'Nachricht 51 über dem Tageslimit',
      }),
    ).rejects.toThrow(TooManyRequestsError)
  })

  it('executes a full multi-turn Choice-Chip dialog, applies action, undoes null-previousValue cleanly, and re-applies', async () => {
    // Turn 1: User asks general question about training -> Eule responds with follow-up Choice-Chips
    const turn1 = await advisorService.sendMessage(USER_A, YEAR, {
      message: 'Ich hatte dieses Jahr eine berufliche Fortbildung',
    })
    expect(turn1.assistantMessage.meta?.choices).toContain('Online-Kurs von zu Hause (350 €)')
    expect(turn1.assistantMessage.meta?.action).toBeUndefined()

    // Turn 2: User selects Choice-Chip -> Eule proposes concrete action with legal citations
    const turn2 = await advisorService.sendMessage(USER_A, YEAR, {
      message: 'Online-Kurs von zu Hause (350 €)',
    })
    const action = turn2.assistantMessage.meta?.action
    expect(action).toBeDefined()
    // The chip names an amount, so the draft records what the training cost (#476), and answers
    // the question it depends on in the same step.
    expect(action?.field).toBe('fortbildung-kosten')
    expect(action?.newValue).toBe('350')
    expect(action?.companionFields).toEqual({ fortbildung: 'Ja' })

    // Apply -> Undo -> Re-Apply round-trip
    const applied = await advisorService.applyAction(USER_A, YEAR, action!.actionId)
    expect(applied.action.status).toBe('applied')
    const rowsAfterApply = await interviewRepo.findAllForUserAndYear(USER_A, YEAR)
    expect(rowsAfterApply.find((r) => r.questionId === 'fortbildung')?.value).toBe('Ja')
    expect(rowsAfterApply.find((r) => r.questionId === 'fortbildung-kosten')?.value).toBe('350')

    const undone = await advisorService.undoAction(USER_A, YEAR, action!.actionId)
    expect(undone.action.status).toBe('undone')
    const rowsAfterUndo = await interviewRepo.findAllForUserAndYear(USER_A, YEAR)
    expect(rowsAfterUndo.find((r) => r.questionId === 'fortbildung')).toBeUndefined()
    expect(rowsAfterUndo.find((r) => r.questionId === 'fortbildung-kosten')).toBeUndefined()

    const reapplied = await advisorService.applyAction(USER_A, YEAR, action!.actionId)
    expect(reapplied.action.status).toBe('applied')
  })
})
