import { beforeEach, describe, expect, it } from 'vitest'
import { AdvisorService, ADVISOR_DAILY_MESSAGE_LIMIT } from '../src/advisor/advisor.service.js'
import { InMemoryAdvisorRepository } from '../src/advisor/advisor.repository.js'
import { AuditService } from '../src/audit/audit.service.js'
import { ConfirmationService } from '../src/confirmation/confirmation.service.js'
import { fieldAccessFrom } from '../src/confirmation/field-access.js'
import { RagKiAdapter } from '../src/ki/ki.adapter.js'
import { OwlModeService } from '../src/owl-mode/owl-mode.service.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakeCommuteRepository } from './fakes/fake-commute.repository.js'
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

const USER = 'user-advisor-1'
const YEAR = 2025

describe('AdvisorService (In-App Steuerberater Agent "Deine Eule")', () => {
  let advisorRepo: InMemoryAdvisorRepository
  let interviewRepo: FakeInterviewAnswerRepository
  let lstbRepo: FakeLstbRepository
  let chRepo: FakeChSalaryCertificateRepository
  let childRepo: FakeChildRepository
  let profileRepo: FakeProfileRepository
  let commuteRepo: FakeCommuteRepository
  let assessmentRepo: FakeAssessmentRepository
  let markingRepo: FakeMarkingRepository
  let auditRepo: FakeAuditRepository
  let confirmationService: ConfirmationService
  let owlModeService: OwlModeService
  let advisorService: AdvisorService

  beforeEach(async () => {
    advisorRepo = new InMemoryAdvisorRepository()
    interviewRepo = new FakeInterviewAnswerRepository()
    lstbRepo = new FakeLstbRepository()
    chRepo = new FakeChSalaryCertificateRepository()
    childRepo = new FakeChildRepository()
    profileRepo = new FakeProfileRepository()
    commuteRepo = new FakeCommuteRepository()
    assessmentRepo = new FakeAssessmentRepository()
    markingRepo = new FakeMarkingRepository()
    auditRepo = new FakeAuditRepository()

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
      commute: commuteRepo,
      assessment: assessmentRepo,
    })

    confirmationService = new ConfirmationService(markingRepo, access, auditService)
    owlModeService = new OwlModeService(
      new FakeOwlSettingRepository(),
      new FakeOwlCardDismissalRepository(),
      childRepo,
      interviewRepo,
      assessmentRepo,
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
      commuteRepo,
      childRepo,
      new FakeRentalRepository(),
      new FakeCapitalRepository(),
      profileRepo,
    )

    // Seed baseline profile & LStB
    await profileRepo.upsert(USER, {
      firstName: 'Markus',
      lastName: 'Brenner',
      steuerId: '12345678901',
      steuernummer: '09/123/45678',
    })
    await childRepo.create(USER, YEAR, {
      firstName: 'Mila',
      lastName: 'Brenner',
      geburtsdatum: '2019-05-12',
    })
    await lstbRepo.setField(USER, YEAR, 'bruttoarbeitslohn', '65000')
    await lstbRepo.setField(USER, YEAR, 'lohnsteuer', '12500')
    await lstbRepo.setField(USER, YEAR, 'sozialversicherung', '12000')
    await interviewRepo.write({ userId: USER, taxYear: YEAR - 1, questionId: 'spenden-betrag', value: '200', openItems: 0 })
  })

  it('builds a 100% PII-free CaseDigest and scrubs user free-text names, Steuer-IDs, and IBANs', async () => {
    const digest = await advisorService.buildCaseDigest(USER, YEAR)
    const serialized = JSON.stringify(digest)
    expect(serialized).not.toContain('Markus')
    expect(serialized).not.toContain('Brenner')
    expect(serialized).not.toContain('Mila')
    expect(serialized).not.toContain('12345678901')
    expect(digest.childrenCount).toBe(1)

    const res = await advisorService.sendMessage(USER, YEAR, {
      message:
        'Ich bin Markus Brenner (Kind Mila, Steuer-ID 12 345 678 901, IBAN DE89 3704 0044 0532 0130 00) und möchte 250 € Spenden eintragen.',
    })
    expect(res.userMessage.content).not.toContain('Markus')
    expect(res.userMessage.content).not.toContain('Mila')
    expect(res.userMessage.content).not.toContain('12 345 678 901')
    expect(res.userMessage.content).not.toContain('DE89 3704')
    expect(res.userMessage.content).toContain('[MANDANT]')
    expect(res.userMessage.content).toContain('[STEUER-ID-GESCHÜTZT]')
    expect(res.userMessage.content).toContain('[IBAN-GESCHÜTZT]')
  })

  it('enforces Zero-Write during chat, applies action with confirmed=true on 1-click Apply, and restores previousValue on 1-click Undo', async () => {
    // Seed an existing donation value of 100 €
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '100', openItems: 0 })

    // 1. Chat turn proposes 300 € Spenden — Zero-Write check!
    const chatRes = await advisorService.sendMessage(USER, YEAR, {
      message: 'Bitte 300 € Spenden eintragen',
    })
    const action = chatRes.assistantMessage.meta?.action
    expect(action).toBeDefined()
    expect(action?.status).toBe('pending')
    expect(action?.newValue).toBe('300')
    expect(action?.deltaEur).toBeGreaterThan(0)

    // Verify Zero-Write: DB still holds '100' before user clicks "✓ Jetzt übernehmen"
    const beforeApplyRows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(beforeApplyRows.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('100')

    // 2. User clicks "✓ Jetzt übernehmen" (1-click Apply)
    const applyRes = await advisorService.applyAction(USER, YEAR, action!.actionId)
    expect(applyRes.action.status).toBe('applied')
    expect(applyRes.action.previousValue).toBe('100')

    const afterApplyRows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(afterApplyRows.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('300')

    // Verify Provenance is recorded as Assistent: SteuerEule AND already confirmed (no double confirmation!)
    expect(await confirmationService.missing(USER, YEAR)).toEqual([])
    const savedMarking = markingRepo.all().find((m) => m.key === 'interview.spenden-betrag')
    expect(savedMarking).toMatchObject({
      provenance: { kind: 'assistent', name: 'SteuerEule' },
      confirmed: true,
    })

    // 3. User clicks "↩ Rückgängig machen" (1-click Undo)
    const undoRes = await advisorService.undoAction(USER, YEAR, action!.actionId)
    expect(undoRes.action.status).toBe('undone')

    const afterUndoRows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(afterUndoRows.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('100')
    expect(markingRepo.all().find((m) => m.key === 'interview.spenden-betrag')).toBeUndefined()
  })

  it('supports Two-Paths comparison and applying either path', async () => {
    const chatRes = await advisorService.sendMessage(USER, YEAR, {
      message: 'Homeoffice vs. Arbeitszimmer prüfen',
    })
    const twoPaths = chatRes.assistantMessage.meta?.twoPaths
    expect(twoPaths).toBeDefined()

    const applyRes = await advisorService.applyAction(USER, YEAR, twoPaths!.maxPath.actionId)
    expect(applyRes.action.status).toBe('applied')
    expect(applyRes.action.newValue).toBe('Fast immer')

    const rows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(rows.find((r) => r.questionId === 'homeoffice')?.value).toBe('Fast immer')
  })

  it('enforces the daily quota of 50 messages per user', async () => {
    for (let i = 0; i < ADVISOR_DAILY_MESSAGE_LIMIT; i++) {
      await advisorRepo.createMessage({
        userId: USER,
        taxYear: YEAR,
        role: 'user',
        content: `Msg ${i}`,
        meta: null,
      })
    }

    await expect(
      advisorService.sendMessage(USER, YEAR, { message: 'Noch eine Frage' }),
    ).rejects.toMatchObject({
      code: 'ADVISOR_DAILY_LIMIT_EXCEEDED',
    })
  })

  it('captures raw expectedPreviousValue on drafts, rejects stale applies with 409 conflict, and marks older drafts superseded', async () => {
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '100', openItems: 0 })

    const turn1 = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 250 € Spenden eintragen' })
    const draft1 = turn1.assistantMessage.meta?.action
    expect(draft1?.expectedPreviousValue).toBe('100')

    // Sending a newer draft for the same field supersedes the earlier pending draft
    const turn2 = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 400 € Spenden eintragen' })
    const draft2 = turn2.assistantMessage.meta?.action
    expect(draft2?.expectedPreviousValue).toBe('100')

    const session = await advisorService.getSession(USER, YEAR)
    const oldMsg = session.messages.find((m) => m.id === turn1.assistantMessage.id)
    expect(oldMsg?.meta?.action?.status).toBe('superseded')
    await expect(advisorService.applyAction(USER, YEAR, draft1!.actionId)).rejects.toMatchObject({
      code: 'ADVISOR_ACTION_SUPERSEDED',
    })

    // User manually changes the field in the mask before applying draft2 -> 409 Stale-Check conflict
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '180', openItems: 0 })
    await expect(advisorService.applyAction(USER, YEAR, draft2!.actionId)).rejects.toMatchObject({
      code: 'ADVISOR_ACTION_STALE_CONFLICT',
    })
    const stillUnchanged = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(stillUnchanged.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('180')
  })

  it('applies multiple drafts atomically via applyBatch and aborts all-or-nothing when any draft is stale', async () => {
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'weg', value: '15', openItems: 0 })

    const t1 = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
    const t2 = await advisorService.sendMessage(USER, YEAR, { message: 'Mein Arbeitsweg beträgt 28 km' })
    const d1 = t1.assistantMessage.meta!.action!
    const d2 = t2.assistantMessage.meta!.action!

    // Stale conflict on second item must prevent first item from writing anything!
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'weg', value: '20', openItems: 0 })
    await expect(
      advisorService.applyBatch(USER, YEAR, {
        drafts: [
          { actionId: d1.actionId, expectedPreviousValue: d1.expectedPreviousValue },
          { actionId: d2.actionId, expectedPreviousValue: '15' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'ADVISOR_ACTION_STALE_CONFLICT' })

    const afterAbort = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(afterAbort.find((r) => r.questionId === 'spenden-betrag')).toBeUndefined()
    expect(afterAbort.find((r) => r.questionId === 'weg')?.value).toBe('20')

    // Now re-stage d2 cleanly against '20' and batch-apply both atomically
    const t2Fresh = await advisorService.sendMessage(USER, YEAR, { message: 'Mein Arbeitsweg beträgt 28 km' })
    const d2Fresh = t2Fresh.assistantMessage.meta!.action!
    expect(d2Fresh.expectedPreviousValue).toBe('20')

    const batchRes = await advisorService.applyBatch(USER, YEAR, {
      drafts: [
        { actionId: d1.actionId, expectedPreviousValue: d1.expectedPreviousValue },
        { actionId: d2Fresh.actionId, expectedPreviousValue: '20' },
      ],
    })
    expect(batchRes.actions).toHaveLength(2)
    expect(batchRes.actions.every((a) => a.status === 'applied')).toBe(true)

    const afterCommit = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(afterCommit.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('300')
    expect(afterCommit.find((r) => r.questionId === 'weg')?.value).toBe('28')
    expect(await confirmationService.missing(USER, YEAR)).toEqual([])
  })

  it('rolls back already-written fields in applyBatch when a later item fails mid-commit', async () => {
    const t1 = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 250 € Spenden eintragen' })
    const d1 = t1.assistantMessage.meta!.action!

    // Stage a valid draft 1 followed by an invalid commute draft stored in history
    const badMsg = await advisorRepo.createMessage({
      userId: USER,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Urlaub korrigieren',
      meta: {
        action: {
          actionId: 'act-bad-commute',
          status: 'pending',
          screen: 'commute',
          field: 'vacationDays',
          instance: null,
          label: 'Urlaubstage',
          previousValue: null,
          expectedPreviousValue: null,
          newValue: '300',
          beforeRefundEur: 500,
          afterRefundEur: 500,
          deltaEur: 0,
          reason: 'Test rollback',
          sourceId: 'estg-9-1',
        },
      },
    })
    expect(badMsg.id).toBeDefined()

    await expect(
      advisorService.applyBatch(USER, YEAR, {
        drafts: [{ actionId: d1.actionId }, { actionId: 'act-bad-commute' }],
      }),
    ).rejects.toMatchObject({ code: 'ARBEITSTAGE_WIDERSPRUCH' })

    // Draft 1 & its companion field must have been rolled back completely!
    const afterRollback = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(afterRollback.find((r) => r.questionId === 'spenden-betrag')).toBeUndefined()
    expect(afterRollback.find((r) => r.questionId === 'spenden')).toBeUndefined()
    const session = await advisorService.getSession(USER, YEAR)
    const d1After = session.messages.find((m) => m.id === t1.assistantMessage.id)?.meta?.action
    expect(d1After?.status).toBe('pending')
  })
})
