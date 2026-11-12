import type { AdvisorEnginePort } from '@steuereule/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { AdvisorService } from '../src/advisor/advisor.service.js'
import { DEFAULT_AI_TURN_LIMITS } from '../src/ki/ai-runtime-config.service.js'
import type { TransactionRunner } from '../src/prisma/transaction.js'
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

  it('applies a draft with several fields to a commute record that does not exist yet (#476)', async () => {
    // Found against the real model: the first field created the record with its defaults (Mon–Fri),
    // and the next field of the same draft was then refused as "changed in the meantime".
    await advisorRepo.createMessage({
      userId: USER,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Entwurf.',
      meta: {
        action: {
          actionId: 'act-commute-new', status: 'pending', screen: 'commute', field: 'oneWayKm', instance: null,
          companionFields: { transport: 'pkw', workdays: '1,2,3,4,5' },
          companionExpectedValues: { transport: null, workdays: null },
          label: 'Arbeitsweg', previousValue: null, expectedPreviousValue: null, newValue: '38',
          beforeRefundEur: 0, afterRefundEur: 600, deltaEur: 600, reason: 'r', sourceId: 'estg-9-1',
        },
      },
    })

    const applied = await advisorService.applyAction(USER, YEAR, 'act-commute-new')
    expect(applied.action.status).toBe('applied')
    expect(await commuteRepo.findForUserAndYear(USER, YEAR)).toMatchObject({ oneWayKm: 38, transport: 'pkw', workdays: [1, 2, 3, 4, 5] })

    // Undo takes the values back again.
    const undone = await advisorService.undoAction(USER, YEAR, 'act-commute-new')
    expect(undone.action.status).toBe('undone')
    expect((await commuteRepo.findForUserAndYear(USER, YEAR))?.oneWayKm ?? null).toBeNull()
  })

  it('still refuses a draft whose field someone changed after it was made', async () => {
    await commuteRepo.save(USER, YEAR, { workdays: [1, 2, 3, 4, 5], vacationDays: 0, sickDays: 0, homeOfficeDays: 0, oneWayKm: 20, transport: 'pkw', workplace: null })
    await advisorRepo.createMessage({
      userId: USER,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Entwurf.',
      meta: {
        action: {
          actionId: 'act-commute-stale', status: 'pending', screen: 'commute', field: 'oneWayKm', instance: null,
          label: 'Arbeitsweg', previousValue: '12', expectedPreviousValue: '12', newValue: '38',
          beforeRefundEur: 0, afterRefundEur: 600, deltaEur: 600, reason: 'r', sourceId: 'estg-9-1',
        },
      },
    })
    await expect(advisorService.applyAction(USER, YEAR, 'act-commute-stale')).rejects.toMatchObject({ code: 'ADVISOR_ACTION_STALE_CONFLICT' })
    expect((await commuteRepo.findForUserAndYear(USER, YEAR))?.oneWayKm).toBe(20)
  })

  describe('the value check on the write itself (ADR-0066)', () => {
    const storedDraft = (actionId: string, field: string, newValue: string) =>
      advisorRepo.createMessage({
        userId: USER,
        taxYear: YEAR,
        role: 'assistant',
        content: 'Entwurf.',
        meta: {
          action: {
            actionId, status: 'pending', screen: 'lstb', field, instance: null, label: 'Lohn',
            previousValue: '65000', expectedPreviousValue: '65000', newValue,
            beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'r', sourceId: 'estg-9-1',
          },
        },
      })

    it('stores the tidied value of a draft that was made in a looser form', async () => {
      await storedDraft('act-loose', 'bruttoarbeitslohn', '70.000 €')
      const applied = await advisorService.applyAction(USER, YEAR, 'act-loose')
      expect(applied.action.status).toBe('applied')
      expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('70000')
    })

    it('refuses a stored draft whose value the field cannot hold, and writes nothing', async () => {
      await storedDraft('act-nonsense', 'bruttoarbeitslohn', 'xyz-unsinn')
      await expect(advisorService.applyAction(USER, YEAR, 'act-nonsense')).rejects.toMatchObject({ code: 'FIELD_VALUE_INVALID' })
      expect((await lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('65000')
    })
  })

  it('carries stated training costs into the CaseDigest, and none while the question is unanswered (#476)', async () => {
    expect((await advisorService.buildCaseDigest(USER, YEAR)).catalogExpenses.trainingCostsEur).toBeNull()
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'fortbildung', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'fortbildung-kosten', value: '850', openItems: 0 })
    const digest = await advisorService.buildCaseDigest(USER, YEAR)
    expect(digest.catalogExpenses).toMatchObject({ hasTraining: true, trainingCostsEur: 850 })
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

  describe('turbo mode', () => {
    beforeEach(async () => {
      await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Ja', openItems: 0 })
      await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '100', openItems: 0 })
    })

    it('applies the drafts of the answer without a click, marks the answer and can be undone', async () => {
      const res = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen', turbo: true })
      const action = res.assistantMessage.meta?.action
      expect(action?.status).toBe('applied')
      expect(action?.previousValue).toBe('100')
      expect(res.assistantMessage.meta?.turbo).toBe(true)
      const rows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
      expect(rows.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('300')
      expect(markingRepo.all().find((m) => m.key === 'interview.spenden-betrag')).toMatchObject({ provenance: { kind: 'assistent', name: 'SteuerEule' } })

      const undone = await advisorService.undoAction(USER, YEAR, action!.actionId)
      expect(undone.action.status).toBe('undone')
      const after = await interviewRepo.findAllForUserAndYear(USER, YEAR)
      expect(after.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('100')
    })

    it('stays Zero-Write when turbo is off or not asked for', async () => {
      const off = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen', turbo: false })
      expect(off.assistantMessage.meta?.action?.status).toBe('pending')
      expect(off.assistantMessage.meta?.turbo).toBeUndefined()
      const none = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 400 € Spenden eintragen' })
      expect(none.assistantMessage.meta?.action?.status).toBe('pending')
      const rows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
      expect(rows.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('100')
    })
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
    for (let i = 0; i < DEFAULT_AI_TURN_LIMITS.dailyMessageLimit; i++) {
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
          { actionId: d1.actionId },
          { actionId: d2.actionId },
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
        { actionId: d1.actionId },
        { actionId: d2Fresh.actionId },
      ],
    })
    expect(batchRes.actions).toHaveLength(2)
    expect(batchRes.actions.every((a) => a.status === 'applied')).toBe(true)

    const afterCommit = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(afterCommit.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('300')
    expect(afterCommit.find((r) => r.questionId === 'weg')?.value).toBe('28')
    expect(await confirmationService.missing(USER, YEAR)).toEqual([])
  })

  it('runs every write of a batch inside one transaction and lets a mid-commit failure escape it, so the database rolls back', async () => {
    const t1 = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 250 € Spenden eintragen' })
    const d1 = t1.assistantMessage.meta!.action!
    await advisorRepo.createMessage({
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

    const runs: Array<{ outcome: 'committed' | 'rolled-back'; error?: unknown }> = []
    let insideTransaction = false
    const recordingRunner: TransactionRunner = {
      async run(work) {
        insideTransaction = true
        try {
          const result = await work()
          runs.push({ outcome: 'committed' })
          return result
        } catch (error) {
          runs.push({ outcome: 'rolled-back', error })
          throw error
        } finally {
          insideTransaction = false
        }
      },
    }
    const writesOutsideTransaction: string[] = []
    const originalWrite = confirmationService.writeConfirmedByAdvisor.bind(confirmationService)
    confirmationService.writeConfirmedByAdvisor = async (...args) => {
      if (!insideTransaction) writesOutsideTransaction.push(args[2])
      return originalWrite(...args)
    }
    const transactional = new AdvisorService(
      advisorRepo,
      owlModeService,
      confirmationService,
      new AuditService(auditRepo),
      interviewRepo,
      lstbRepo,
      chRepo,
      commuteRepo,
      childRepo,
      new FakeRentalRepository(),
      new FakeCapitalRepository(),
      profileRepo,
      undefined,
      undefined,
      recordingRunner,
    )

    await expect(
      transactional.applyBatch(USER, YEAR, { drafts: [{ actionId: d1.actionId }, { actionId: 'act-bad-commute' }] }),
    ).rejects.toMatchObject({ code: 'ARBEITSTAGE_WIDERSPRUCH' })

    expect(runs).toHaveLength(1)
    expect(runs[0]!.outcome).toBe('rolled-back')
    expect(writesOutsideTransaction).toEqual([])
    // The draft keeps its pending status because the meta update sits in the same transaction.
    const session = await transactional.getSession(USER, YEAR)
    expect(session.messages.find((m) => m.id === t1.assistantMessage.id)?.meta?.action?.status).toBe('pending')
  })

  it('reports every stale field with its current value and applies once the client acknowledges exactly that value', async () => {
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '100', openItems: 0 })
    const turn = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
    const draft = turn.assistantMessage.meta!.action!

    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '180', openItems: 0 })
    const conflict = await advisorService.applyBatch(USER, YEAR, { drafts: [{ actionId: draft.actionId }] }).catch((e: unknown) => e)
    expect(conflict).toMatchObject({
      code: 'ADVISOR_ACTION_STALE_CONFLICT',
      details: { conflicts: [{ actionId: draft.actionId, key: 'interview.spenden-betrag', currentValue: '180' }] },
    })

    // Acknowledging a value the field does not hold is still rejected: it is a compare-and-set, not an override.
    await expect(
      advisorService.applyBatch(USER, YEAR, {
        drafts: [{ actionId: draft.actionId, acknowledgedCurrentValues: { 'interview.spenden-betrag': '999' } }],
      }),
    ).rejects.toMatchObject({ code: 'ADVISOR_ACTION_STALE_CONFLICT' })

    const applied = await advisorService.applyBatch(USER, YEAR, {
      drafts: [{ actionId: draft.actionId, acknowledgedCurrentValues: { 'interview.spenden-betrag': '180' } }],
    })
    expect(applied.actions[0]!.status).toBe('applied')
    expect(applied.actions[0]!.previousValue).toBe('180')
    expect(applied.actions[0]).not.toHaveProperty('undoSnapshot')
    const rows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(rows.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('300')
  })

  it('stale-checks companion fields too', async () => {
    const turn = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
    const draft = turn.assistantMessage.meta!.action!
    expect(draft.companionFields).toEqual({ spenden: 'Ja' })
    expect(draft.companionExpectedValues).toEqual({ spenden: null })

    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Nein', openItems: 0 })
    await expect(advisorService.applyAction(USER, YEAR, draft.actionId)).rejects.toMatchObject({
      code: 'ADVISOR_ACTION_STALE_CONFLICT',
      details: { conflicts: [{ key: 'interview.spenden', currentValue: 'Nein' }] },
    })
  })

  it('undo restores the exact prior value and provenance of main and companion fields, and refuses after a manual edit', async () => {
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '100', openItems: 0 })
    await markingRepo.save(USER, YEAR, {
      key: 'interview.spenden-betrag',
      provenance: { kind: 'uebernahme', lastYear: YEAR - 1 },
      confirmed: true,
      proposal: null,
    })

    const turn = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
    const draft = turn.assistantMessage.meta!.action!
    await advisorService.applyAction(USER, YEAR, draft.actionId)
    await advisorService.undoAction(USER, YEAR, draft.actionId)

    const rows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(rows.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('100')
    expect(rows.find((r) => r.questionId === 'spenden')?.value).toBe('Ja')
    expect(markingRepo.all().find((m) => m.key === 'interview.spenden-betrag')).toMatchObject({
      provenance: { kind: 'uebernahme', lastYear: YEAR - 1 },
      confirmed: true,
    })

    await advisorService.applyAction(USER, YEAR, draft.actionId)
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: '320', openItems: 0 })
    await expect(advisorService.undoAction(USER, YEAR, draft.actionId)).rejects.toMatchObject({
      code: 'ADVISOR_ACTION_STALE_CONFLICT',
    })
    const afterRefusedUndo = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(afterRefusedUndo.find((r) => r.questionId === 'spenden-betrag')?.value).toBe('320')
  })

  it('refuses to apply a stored draft that targets a locked field, even if it slipped past proposal validation', async () => {
    await advisorRepo.createMessage({
      userId: USER,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Manipulierter Entwurf',
      meta: {
        action: {
          actionId: 'act-companion-pii',
          status: 'pending',
          screen: 'interview',
          field: 'spenden-betrag',
          instance: null,
          companionFields: { firstName: 'Mallory' },
          label: 'Spenden',
          previousValue: null,
          expectedPreviousValue: null,
          newValue: '50',
          beforeRefundEur: 0,
          afterRefundEur: 0,
          deltaEur: 0,
          reason: 'Test',
          sourceId: 'estg-10b',
        },
      },
    })
    await expect(advisorService.applyAction(USER, YEAR, 'act-companion-pii')).rejects.toMatchObject({
      code: 'AI_WRITE_FORBIDDEN',
    })
    const rows = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(rows.find((r) => r.questionId === 'spenden-betrag')).toBeUndefined()
  })

  it('keeps the trail of an AI-applied change on the draft and a value-free row in the audit log', async () => {
    const turn = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
    const draft = turn.assistantMessage.meta!.action!
    const applied = await advisorService.applyAction(USER, YEAR, draft.actionId)
    expect(applied.action.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const auditRow = (await auditRepo.findOwnRows(USER)).find((r) => r.resource === 'berater_aktion')
    expect(auditRow).toMatchObject({ action: 'WRITE', source: 'Assistent: SteuerEule' })
    expect(JSON.stringify(auditRow)).not.toContain('300')

    const stored = await advisorRepo.findMessageByActionId(USER, YEAR, draft.actionId)
    expect(stored?.meta?.engine).toEqual({ mode: 'deterministic_fallback', provider: 'deterministic' })
    expect(stored?.meta?.action).toMatchObject({ field: 'spenden-betrag', newValue: '300', appliedAt: applied.action.appliedAt })

    const undone = await advisorService.undoAction(USER, YEAR, draft.actionId)
    expect(undone.action.undoneAt).toBeDefined()
    const reapplied = await advisorService.applyAction(USER, YEAR, draft.actionId)
    expect(reapplied.action.undoneAt).toBeUndefined()
  })

  it('treats AMOUNT_LATER catalog amounts as null (not NaN) in CaseDigest', async () => {
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'umzug', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'umzug-kosten', value: 'spaeter', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden-betrag', value: 'spaeter', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'kv-pv', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'kv-pv-betrag', value: 'spaeter', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'riester', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'riester-betrag', value: 'spaeter', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'dhf', value: 'Ja', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'dhf-miete', value: 'spaeter', openItems: 0 })
    await interviewRepo.write({ userId: USER, taxYear: YEAR - 1, questionId: 'spenden-betrag', value: 'spaeter', openItems: 0 })

    const digest = await advisorService.buildCaseDigest(USER, YEAR)

    expect(digest.catalogExpenses).toEqual({
      hasTraining: false,
      trainingCostsEur: null,
      relocationCostsEur: null,
      donationsEur: null,
      selfPaidKvPvEur: null,
      riesterEur: null,
      doubleHouseholdRentEur: null,
    })
    expect(digest.priorYearComparison.donationsEur).toBeNull()
  })

  it('tells the engine to open with a plan only for the „Was hab ich vergessen?“ quick start (#451 slice 6)', async () => {
    const seen: Array<boolean | undefined> = []
    const recordingEngine: AdvisorEnginePort = {
      async runTurn() {
        throw new Error('not used')
      },
      async *streamTurn(request) {
        seen.push(request.planRequired)
        yield { event: 'done', data: { replyText: 'Ok.', meta: {}, mode: 'langgraph' } }
      },
    }
    const withEngine = new AdvisorService(
      advisorRepo,
      owlModeService,
      confirmationService,
      new AuditService(auditRepo),
      interviewRepo,
      lstbRepo,
      chRepo,
      commuteRepo,
      childRepo,
      new FakeRentalRepository(),
      new FakeCapitalRepository(),
      profileRepo,
      recordingEngine,
    )
    await withEngine.sendMessage(USER, YEAR, { message: 'Was hab ich vergessen?', quickAction: 'forgotten_check' })
    await withEngine.sendMessage(USER, YEAR, { message: 'Was hab ich vergessen?' })
    expect(seen).toEqual([true, false])
  })

  describe('replace a turn: regenerate and edit-and-resend (#451 slice 1b)', () => {
    beforeEach(async () => {
      await interviewRepo.write({ userId: USER, taxYear: YEAR, questionId: 'spenden', value: 'Ja', openItems: 0 })
    })

    it('replaces the last turn: the old answer leaves the session and its pending proposal is dismissed, never applied', async () => {
      const first = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
      const oldAction = first.assistantMessage.meta!.action!
      expect(oldAction.status).toBe('pending')

      const second = await advisorService.sendMessage(USER, YEAR, {
        message: 'Bitte 350 € Spenden eintragen',
        replaceFromMessageId: first.userMessage.id,
      })

      const session = await advisorService.getSession(USER, YEAR)
      expect(session.messages.map((m) => m.id)).toEqual([second.userMessage.id, second.assistantMessage.id])
      await expect(advisorService.applyAction(USER, YEAR, oldAction.actionId)).rejects.toMatchObject({ code: 'ADVISOR_ACTION_DISMISSED' })
      expect(second.assistantMessage.meta?.action?.newValue).toBe('350')
    })

    it('regenerates with the same question', async () => {
      const first = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
      const again = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen', replaceFromMessageId: first.userMessage.id })
      const session = await advisorService.getSession(USER, YEAR)
      expect(session.messages).toHaveLength(2)
      expect(session.messages[0]!.id).toBe(again.userMessage.id)
    })

    it('refuses to replace anything but the latest question', async () => {
      const first = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
      await advisorService.sendMessage(USER, YEAR, { message: 'Was ist der Pauschbetrag?' })
      await expect(
        advisorService.sendMessage(USER, YEAR, { message: 'x', replaceFromMessageId: first.userMessage.id }),
      ).rejects.toMatchObject({ code: 'ADVISOR_REPLACE_NOT_LATEST' })
      await expect(
        advisorService.sendMessage(USER, YEAR, { message: 'x', replaceFromMessageId: first.assistantMessage.id }),
      ).rejects.toMatchObject({ code: 'ADVISOR_REPLACE_NOT_LATEST' })
    })

    it('leaves an applied proposal applied: replacing only dismisses what is still pending', async () => {
      const first = await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen' })
      await advisorService.applyAction(USER, YEAR, first.assistantMessage.meta!.action!.actionId)
      await advisorService.sendMessage(USER, YEAR, { message: 'Bitte 300 € Spenden eintragen', replaceFromMessageId: first.userMessage.id })
      await expect(advisorService.applyAction(USER, YEAR, first.assistantMessage.meta!.action!.actionId)).rejects.toMatchObject({
        code: 'ADVISOR_ACTION_ALREADY_APPLIED',
      })
    })
  })
})
