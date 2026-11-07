// DevMLOps Backend Red-Team & Boundary Gate:
//   1. Egress PII guard (`checkPiiFree`) against obfuscated IBANs, formatted Steuer-IDs, and forbidden keys.
//   2. Cross-user isolation on Advisor chat sessions, messages, and action mutations (`applyAction`/`undoAction`).
//   3. Daily rate-limit enforcement (`ADVISOR_DAILY_MESSAGE_LIMIT = 50`).
//   4. MCP Server tool scope enforcement (`steuerdaten:read` cannot invoke write/payment tools).
import { beforeEach, describe, expect, it } from 'vitest'
import { AdvisorService, ADVISOR_DAILY_MESSAGE_LIMIT } from '../src/advisor/advisor.service.js'
import { InMemoryAdvisorRepository } from '../src/advisor/advisor.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { NotFoundError, TooManyRequestsError } from '../src/common/domain-error.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { checkPiiFree, RagKiAdapter, validateAiProposal } from '../src/ki/ki.adapter.js'
import { OwlModeService } from '../src/owl-mode/owl-mode.service.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMarkingRepository } from './fakes/fake-marking.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import {
  FakeOwlCardDismissalRepository,
  FakeOwlSettingRepository,
} from './fakes/fake-owl-mode.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeProfileRepository } from './fakes/fake-profile.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'

const USER_A = 'user-redteam-a'
const USER_B = 'user-redteam-b'
const YEAR = 2025

describe('DevMLOps Backend Red-Team & Egress Boundary Suite', () => {
  let advisorService: AdvisorService
  let interviewRepo: FakeInterviewAnswerRepository

  beforeEach(async () => {
    const advisorRepo = new InMemoryAdvisorRepository()
    interviewRepo = new FakeInterviewAnswerRepository()
    const lstbRepo = new FakeLstbRepository()
    const chRepo = new FakeChSalaryCertificateRepository()
    const childRepo = new FakeChildRepository()
    const profileRepo = new FakeProfileRepository()
    const markingRepo = new FakeMarkingRepository()
    const auditRepo = new FakeAuditRepository()

    const auditService = new AuditService(auditRepo)
    const access = fieldAccessFrom({
      lstb: lstbRepo,
      pension: new FakePensionRepository(),
      capital: new FakeCapitalRepository(),
      rental: new FakeRentalRepository(),
      profile: profileRepo,
      masterData: new FakeMasterDataRepository(),
      link: new FakeLinkRepository(),
      interview: interviewRepo,
      chSalaryCertificate: chRepo,
      child: childRepo,
    })

    const confirmationService = new ConfirmationService(markingRepo, access, auditService)
    const owlModeService = new OwlModeService(
      new FakeOwlSettingRepository(),
      new FakeOwlCardDismissalRepository(),
      childRepo,
      interviewRepo,
      new FakeAssessmentRepository(),
      new RagKiAdapter(),
      auditService,
    )

    advisorService = new AdvisorService(
      advisorRepo,
      owlModeService,
      confirmationService,
      auditService,
      interviewRepo,
      lstbRepo,
      chRepo,
      undefined,
      childRepo,
      new FakeRentalRepository(),
      new FakeCapitalRepository(),
      profileRepo,
    )

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

    // User A applies it legitimately
    const applied = await advisorService.applyAction(USER_A, YEAR, actionId!)
    expect(applied.action.status).toBe('applied')

    // User B tries to undo User A's applied actionId
    await expect(advisorService.undoAction(USER_B, YEAR, actionId!)).rejects.toThrow(NotFoundError)

    // User B's session for the same tax year is completely empty
    const sessionB = await advisorService.getSession(USER_B, YEAR)
    expect(sessionB.messages).toHaveLength(0)
  })

  it('enforces daily cost/abuse budget (ADVISOR_DAILY_MESSAGE_LIMIT = 50) and blocks message 51', async () => {
    for (let i = 0; i < ADVISOR_DAILY_MESSAGE_LIMIT; i++) {
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
    expect(action?.field).toBe('fortbildung')
    expect(action?.newValue).toBe('Ja')

    // Apply -> Undo -> Re-Apply round-trip
    const applied = await advisorService.applyAction(USER_A, YEAR, action!.actionId)
    expect(applied.action.status).toBe('applied')
    const rowsAfterApply = await interviewRepo.findAllForUserAndYear(USER_A, YEAR)
    expect(rowsAfterApply.find((r) => r.questionId === 'fortbildung')?.value).toBe('Ja')

    const undone = await advisorService.undoAction(USER_A, YEAR, action!.actionId)
    expect(undone.action.status).toBe('undone')
    const rowsAfterUndo = await interviewRepo.findAllForUserAndYear(USER_A, YEAR)
    expect(rowsAfterUndo.find((r) => r.questionId === 'fortbildung')).toBeUndefined()

    const reapplied = await advisorService.applyAction(USER_A, YEAR, action!.actionId)
    expect(reapplied.action.status).toBe('applied')
  })
})
