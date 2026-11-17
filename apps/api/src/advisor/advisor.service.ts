import { randomUUID } from 'node:crypto'
import { PrintoutService } from '../printout/printout.service.js'
import { PersonalDataConsentService } from '../owl-mode/personal-data-consent.service.js'
import { describePrintoutGap } from './advisor-printout-gaps.js'
import { buildPrintoutPlan, draftsTakenOver, printoutFollowUp } from './advisor-printout-plan.js'
import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../config/features.js'
import { newActionId } from '../common/action-id.js'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  ADVISOR_LEGAL_SOURCES,
  buildAdvisorHistory,
  evaluateAdvisorTurn,
  withPreviewedEffects,
  isOfferedChoice,
  applyInterviewChanges,
  provenanceKey,
  replaceNamesWith,
  scrubUserMessagePii,
  PERSON_B_HANDLE,
  type AdvisorHousehold,
  heldDraftsNote,
  holdUnaskedOverwrites,
  childNamedIn,
  simulateAdvisorFieldDelta,
  addAmounts,
  amountCombination,
  type ExistingValueSource,
  type ReceiptMark,
  sameReceiptAgain,
  sumFieldCombination,
  type AdvisorActionProposal,
  type AdvisorCountedItem,
  type AssignmentMember,
  type AdvisorAssessmentBrief,
  type AdvisorEngineInfo,
  type AdvisorEnginePort,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorMessageFeedback,
  type AdvisorMessageMeta,
  type AdvisorPreviewEffect,
  type AdvisorPreviewTarget,
  type AdvisorRecordHandles,
  type AdvisorStreamEvent,
  type AdvisorTurnRequest,
  type AdvisorTurnResult,
  type AdvisorTurnUsage,
  type CaseDigest,
  type LstbCalculationTerm,
  type LstbExtractedField,
  type OwlSourceId,
  type Screen,
  type WageTaxCertificateFieldId,
  advisorContextUsage,
  buildNoteHandles,
  foldThoughtEvent,
  type AdvisorThoughtStep,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { ADVISOR_ENGINE } from '../ki/langgraph-advisor.engine.js'
import { AI_RUNTIME_CONFIG_SERVICE, DEFAULT_AI_TURN_LIMITS, type AiRuntimeConfigService } from '../ki/ai-runtime-config.service.js'
import { AssessmentService } from '../assessment/assessment.service.js'
import { ModelConnectionService } from '../ki/model-connection.service.js'
import { TaxEstimateService, type TaxEstimateStatus } from '../tax-estimate/tax-estimate.service.js'
import { TRANSACTION_RUNNER, passThroughTransactionRunner, type TransactionRunner } from '../prisma/transaction.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { AdvisorOpening, OPENING_PLACEHOLDER, openingStream } from './advisor-opening.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  type CrossBorderSalaryStatementRepository,
} from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { assertAiWritable } from '../confirmation/ai-write-policy.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { LinkService } from '../link/link.service.js'
import { ConflictError, DomainError, InvalidInputError, NotFoundError, TooManyRequestsError, UnavailableError } from '../common/domain-error.js'
import {
  ADVISOR_REPOSITORY,
  type AdvisorChatMessageRecord,
  type AdvisorConversationRecord,
  type AdvisorMessageUsage,
  type AdvisorRepository,
  type FinishAdvisorMessageInput,
} from './advisor.repository.js'
import type {
  AdvisorActionMutationResponseDto,
  AdvisorChatMessageDto,
  AdvisorConnectionDto,
  AdvisorContextDto,
  AdvisorConversationDto,
  AdvisorNoteDto,
  AdvisorSituationDto,
  AdvisorSearchHitDto,
  AdvisorSessionResponseDto,
  ApplyBatchActionsDto,
  ApplyBatchActionsResponseDto,
  SendAdvisorMessageDto,
  SendAdvisorMessageResponseDto,
  AdvisorOpeningStateDto,
} from './dto/advisor.dto.js'
import { ANSWERING_WINDOW_MS, effectLeftOutOfEstimate, projectsOf, toPublicAction, toPublicMeta, toMessageDto, PreparedAdvisorTurn, titleFrom, liveMessages, historySources, contextOf, toNoteDto, toConversationDto } from './advisor-shared.js'
import { AdvisorConversations } from './advisor-conversations.js'
import { AdvisorProjectNotes } from './advisor-project-notes.js'
import { AdvisorCaseFacts } from './advisor-case-facts.js'
import { buildReceiptInbox } from './advisor-receipt-inbox.js'
import { RECEIPT_REPOSITORY, type ReceiptRepository } from '../receipt/receipt.repository.js'
import { AdvisorDrafts } from './advisor-drafts.js'
export { MAX_CONVERSATIONS_PER_YEAR, searchKey, snippetAround, titleFrom } from './advisor-shared.js'
export type { PreparedAdvisorTurn } from './advisor-shared.js'


/** Commute-mask fields that are a year's total of several receipts. */
const ACCUMULATING_KEYS: ReadonlySet<string> = new Set([
  'commute.workEquipmentEur',
  'commute.otherWorkExpensesEur',
  'commute.professionalBodiesEur',
  'interview.fortbildung-kosten',
  'interview.umzug-kosten',
  'interview.haushalt-handwerker-betrag',
  'interview.haushalt-handwerker-rechnungsbetrag',
  'interview.spenden-betrag',
  'interview.gesundheit-betrag',
])

/** A field (of a person, of a child) whose receipts are counted so none counts twice. */
export interface CountTarget {
  readonly screen: Screen
  readonly field: string
  readonly person?: 'A' | 'B' | undefined
  readonly instance?: string | null | undefined
}

const DETERMINISTIC_ENGINE: AdvisorEngineInfo = { mode: 'deterministic_fallback', provider: 'deterministic' }

const TURN_FAILED_MESSAGE = 'Die Antwort der Eule ist unterwegs abgebrochen. Bitte versuche es erneut.'

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

/** Chat-facing reason of a scanned LStB proposal, e.g. „Zeile 23a (5.051,76 €) + Zeile 25 (…)“. */
function describeLstbCalculation(terms: readonly LstbCalculationTerm[]): string {
  if (terms.length === 0) return 'Aus Lohnsteuerbescheinigung extrahierter Wert (§ 9 Abs. 1 EStG).'
  return `Aus Lohnsteuerbescheinigung: ${terms.map((t) => `Zeile ${t.line} (${EURO.format(t.amount)})`).join(' + ')}`
}

/** Thrown on purpose at the end of an effect preview: the transaction must never commit. */
class PreviewRollback extends Error {}

const midpoint = (state: Extract<TaxEstimateStatus, { kind: 'spanne' }>): number => Math.round((state.result.from + state.result.to) / 2)

/** Turns the two estimates of a preview into what the draft card says; honest when there is no figure. */
export function effectFromEstimates(states: { readonly before: TaxEstimateStatus; readonly after: TaxEstimateStatus } | null): AdvisorPreviewEffect {
  if (states === null) return { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
  const { before, after } = states
  if (before.kind === 'spanne' && after.kind === 'spanne') {
    const beforeRefundEur = midpoint(before)
    const afterRefundEur = midpoint(after)
    return { kind: 'computed', beforeRefundEur, afterRefundEur, deltaEur: afterRefundEur - beforeRefundEur }
  }
  if (after.kind === 'spanne') {
    return { kind: 'not-computable', hint: 'Mit dieser Angabe wird die Schätzung erstmals möglich; einen Unterschied zu vorher gibt es deshalb noch nicht.' }
  }
  if (after.kind === 'offen') {
    return { kind: 'not-computable', hint: 'Wirkung erst berechenbar, wenn die Angaben für die Schätzung vollständig sind (z. B. die Lohnsteuerbescheinigung).' }
  }
  return { kind: 'not-computable', hint: 'Für deine Lebenslage gibt es noch keine automatische Schätzung; die Wirkung kann ich deshalb nicht beziffern.' }
}

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger('AdvisorTurn')

  constructor(
    @Inject(ADVISOR_REPOSITORY) private readonly advisorRepo: AdvisorRepository,
    @Inject(OwlModeService) private readonly owlModeService: OwlModeService,
    @Inject(ConfirmationService) private readonly confirmationService: ConfirmationService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepo: InterviewAnswerRepository,
    @Optional() @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstbRepo?: WageTaxCertificateRepository,
    @Optional()
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY)
    private readonly chRepo?: CrossBorderSalaryStatementRepository,
    @Optional() @Inject(COMMUTE_REPOSITORY) private readonly commuteRepo?: CommuteRepository,
    @Optional() @Inject(CHILD_REPOSITORY) private readonly childRepo?: ChildRepository,
    @Optional() @Inject(RENTAL_REPOSITORY) private readonly rentalRepo?: RentalRepository,
    @Optional() @Inject(CAPITAL_REPOSITORY) private readonly capitalRepo?: CapitalRepository,
    @Optional() @Inject(PROFILE_REPOSITORY) private readonly profileRepo?: ProfileRepository,
    @Optional() @Inject(ADVISOR_ENGINE) private readonly advisorEngine?: AdvisorEnginePort,
    @Optional() @Inject(AI_RUNTIME_CONFIG_SERVICE) private readonly runtimeConfig?: AiRuntimeConfigService,
    @Optional() @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner = passThroughTransactionRunner,
    @Optional() @Inject(TaxEstimateService) private readonly taxEstimate?: TaxEstimateService,
    @Optional() @Inject(ModelConnectionService) private readonly modelConnection?: ModelConnectionService,
    @Optional() @Inject(AssessmentService) private readonly assessmentService?: AssessmentService,
    @Optional() @Inject(PENSION_REPOSITORY) private readonly pensionRepo?: PensionRepository,
    @Optional() @Inject(LinkService) private readonly link?: LinkService,
    @Optional() @Inject(PrintoutService) private readonly printout?: PrintoutService,
    @Optional() @Inject(PersonalDataConsentService) private readonly personalDataConsent?: PersonalDataConsentService,
    @Optional() @Inject(RECEIPT_REPOSITORY) private readonly receiptRepo?: ReceiptRepository,
  ) {}

  /** Whether the user consented to personal data going to the owl's model (ADR-0091); read fresh on every use. */
  private async hasPersonalDataConsent(userId: string): Promise<boolean> {
    return (await this.personalDataConsent?.hasConsent(userId)) ?? false
  }

  // The service is the front door; each theme lives in its own part.
  private openingPart?: AdvisorOpening
  private get opening(): AdvisorOpening {
    return (this.openingPart ??= new AdvisorOpening(
      this.advisorRepo,
      (userId, taxYear) => this.buildCaseDigest(userId, taxYear),
      async (userId) => (await this.notes.getSituation(userId)).text,
      this.taxEstimate ? (userId, taxYear) => this.taxEstimate!.getState(userId, taxYear) : undefined,
    ))
  }

  /** Whether a new conversation opens with the owl speaking first (ADR-0067 §11). */
  async openingState(userId: string, taxYear: number): Promise<AdvisorOpeningStateDto> {
    const state = await this.opening.state(userId, taxYear)
    // Without a language model the fixed rules answer; they have nothing to open with.
    return this.advisorEngine ? state : { ...state, shouldOpen: false }
  }

  private conversationsPart?: AdvisorConversations
  private get conversations(): AdvisorConversations {
    return (this.conversationsPart ??= new AdvisorConversations(this.advisorEngine, this.advisorRepo, this.auditService, (...args) => this.knownNamesForScrubbing(...args)))
  }

  private notesPart?: AdvisorProjectNotes
  private get notes(): AdvisorProjectNotes {
    return (this.notesPart ??= new AdvisorProjectNotes(this.advisorRepo, (...args) => this.knownNamesForScrubbing(...args)))
  }

  private factsPart?: AdvisorCaseFacts
  private get facts(): AdvisorCaseFacts {
    return (this.factsPart ??= new AdvisorCaseFacts(this.capitalRepo, this.chRepo, this.childRepo, this.commuteRepo, this.confirmationService, this.interviewRepo, this.lstbRepo, this.owlModeService, this.profileRepo, this.rentalRepo, this.pensionRepo))
  }

  private draftsPart?: AdvisorDrafts
  private get drafts(): AdvisorDrafts {
    const link = this.link
    return (this.draftsPart ??= new AdvisorDrafts(
      this.advisorRepo,
      this.auditService,
      this.confirmationService,
      this.transactions,
      link ? (userId, taxYear, person) => link.dataUser(userId, taxYear, person) : undefined,
      (userId) => this.hasPersonalDataConsent(userId),
      {
        create: async (dataUserId, taxYear, screen, values) => {
          if (screen === 'kind') {
            if (!this.childRepo) return null
            const child = await this.childRepo.create(dataUserId, taxYear, {
              firstName: values.firstName ?? '',
              lastName: values.lastName ?? '',
              geburtsdatum: values.geburtsdatum ?? '',
            })
            return child.id
          }
          if (screen === 'vermietung') return (await this.rentalRepo?.create(dataUserId, taxYear))?.id ?? null
          return null
        },
        remove: async (dataUserId, taxYear, screen, id) => {
          if (screen === 'kind') await this.childRepo?.delete(dataUserId, taxYear, id)
        },
      },
    ))
  }

  // ── Delegated to the parts ─────────────────────────────────────────────────────────────────

  async conversationFor(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorConversationRecord> {
    return this.conversations.conversationFor(userId, taxYear, conversationId)
  }

  /** Whether the owl can reach its language model right now (#488). */
  async connection(): Promise<AdvisorConnectionDto> {
    return (
      (await this.modelConnection?.check()) ?? { state: 'rules-only', provider: null, model: null, checkedAt: new Date().toISOString() }
    )
  }

  async listConversations(userId: string, taxYear: number): Promise<AdvisorConversationDto[]> {
    return this.conversations.listConversations(userId, taxYear)
  }

  async createConversation(userId: string, taxYear: number): Promise<AdvisorConversationDto> {
    return this.conversations.createConversation(userId, taxYear)
  }

  async renameConversation(userId: string, taxYear: number, conversationId: string, title: string): Promise<AdvisorConversationDto> {
    return this.conversations.renameConversation(userId, taxYear, conversationId, title)
  }

  async deleteConversation(userId: string, taxYear: number, conversationId: string): Promise<{ deletedMessages: number }> {
    return this.conversations.deleteConversation(userId, taxYear, conversationId)
  }

  async summarizeConversation(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorContextDto> {
    return this.conversations.summarizeConversation(userId, taxYear, conversationId)
  }

  async searchConversations(userId: string, taxYear: number, rawQuery: string): Promise<AdvisorSearchHitDto[]> {
    return this.conversations.searchConversations(userId, taxYear, rawQuery)
  }

  async saveSituation(userId: string, taxYear: number, raw: string): Promise<AdvisorSituationDto> {
    return this.notes.saveSituation(userId, taxYear, raw)
  }

  async listNotes(userId: string, taxYear: number): Promise<AdvisorNoteDto[]> {
    return this.notes.listNotes(userId, taxYear)
  }

  async createNote(userId: string, taxYear: number, raw: string): Promise<AdvisorNoteDto> {
    return this.notes.createNote(userId, taxYear, raw)
  }

  async updateNote(userId: string, taxYear: number, noteId: string, raw: string): Promise<AdvisorNoteDto> {
    return this.notes.updateNote(userId, taxYear, noteId, raw)
  }

  async deleteNote(userId: string, taxYear: number, noteId: string): Promise<{ deleted: true }> {
    return this.notes.deleteNote(userId, taxYear, noteId)
  }

  async undoNoteChange(userId: string, taxYear: number, messageId: string, index: number): Promise<AdvisorChatMessageDto> {
    return this.notes.undoNoteChange(userId, taxYear, messageId, index)
  }

  /** Every name that must not reach a model: the user's, the children's and the spouse's. */
  async knownNamesForScrubbing(userId: string, taxYear: number): Promise<string[]> {
    const [own, spouse] = await Promise.all([this.facts.knownNamesForScrubbing(userId, taxYear), this.link?.spouseForAdvisor(userId, taxYear)])
    return [...own, ...[spouse?.firstName, spouse?.lastName].filter((name): name is string => !!name)]
  }

  /**
   * The household as the owl may know it (ADR-0073): whether there is a Person B, whether the user
   * records B's figures, and B's figures already entered. No name, no id.
   */
  async advisorHousehold(userId: string, taxYear: number): Promise<AdvisorHousehold> {
    const spouse = await this.link?.spouseForAdvisor(userId, taxYear)
    if (!spouse) return { personB: null }
    return {
      personB: {
        handle: PERSON_B_HANDLE,
        recordable: spouse.recordable,
        figures: spouse.recordable ? await this.facts.personBFigures(spouse.spouseUserId, taxYear) : null,
      },
    }
  }

  async loadRecordHandles(userId: string, taxYear: number): Promise<AdvisorRecordHandles> {
    return this.facts.loadRecordHandles(userId, taxYear)
  }

  async buildCaseDigest(userId: string, taxYear: number): Promise<CaseDigest> {
    const withInbox = await this.withReceiptInbox(userId, taxYear, await this.facts.buildCaseDigest(userId, taxYear))
    return this.withPrintoutGaps(userId, taxYear, withInbox)
  }

  /** The stored Belege of the year, as far as the owl may know them (no file names). A failing read leaves the digest as it was. */
  private async withReceiptInbox(userId: string, taxYear: number, digest: CaseDigest): Promise<CaseDigest> {
    if (!this.receiptRepo || !digest.furtherFacts) return digest
    try {
      const [records, messages] = await Promise.all([this.receiptRepo.findAllForUser(userId), this.advisorRepo.listForUserAndYear(userId, taxYear)])
      const drafts = messages.flatMap((m) => [...(m.meta?.action ? [m.meta.action] : []), ...(m.meta?.actions ?? [])])
      const receiptInbox = buildReceiptInbox(records, taxYear, drafts)
      checkPiiFree(receiptInbox)
      return receiptInbox.total === 0 ? digest : { ...digest, furtherFacts: { ...digest.furtherFacts, receiptInbox } }
    } catch (error: unknown) {
      this.logger.warn(`receipt inbox skipped: ${error instanceof Error ? error.name : 'error'}`)
      return digest
    }
  }

  private async withPrintoutGaps(userId: string, taxYear: number, digest: CaseDigest): Promise<CaseDigest> {
    if (!this.printout || !digest.furtherFacts) return digest
    let missing: string[]
    try {
      missing = (await this.printout.check(userId, taxYear)).missing
    } catch {
      // A year without forms has no printout to check.
      return digest
    }
    const printoutPlan = await this.printoutPlan(userId, taxYear, missing).catch((error: unknown) => {
      this.logger.warn(`printout plan failed: ${error instanceof Error ? error.name : 'error'}`)
      return undefined
    })
    return { ...digest, furtherFacts: { ...digest.furtherFacts, printoutGaps: missing.map(describePrintoutGap), ...(printoutPlan ? { printoutPlan } : {}) } }
  }

  /** What closes each printout gap, per person, child or object (ADR-0091, Nachtrag). */
  private async printoutPlan(userId: string, taxYear: number, missing: readonly string[]) {
    if (missing.length === 0) return { questions: [], unplanned: [] }
    const [spouse, records, consent] = await Promise.all([this.link?.spouseForAdvisor(userId, taxYear), this.loadRecordHandles(userId, taxYear), this.hasPersonalDataConsent(userId)])
    return buildPrintoutPlan({
      userId,
      taxYear,
      missing,
      spouse: spouse ? { spouseUserId: spouse.spouseUserId, recordable: spouse.recordable } : null,
      records,
      personalDataConsent: consent,
      read: (dataUserId, year, keys) => this.confirmationService.readRawValues(dataUserId, year, keys),
    })
  }

  /** A child's first name for its neutral name, so the app's own question names the child; only with the consent. */
  private async childLabels(userId: string, taxYear: number, consent: boolean): Promise<Record<string, string> | undefined> {
    if (!consent || !this.childRepo) return undefined
    const children = await this.childRepo.listForUserAndYear(userId, taxYear)
    return Object.fromEntries(children.map((child, i) => [`Kind ${i + 1}`, child.firstName]).filter(([, name]) => !!name))
  }

  /** The tax office's notice against the return, as the assessment check needs it: figures only, nothing that names a person. */
  private async assessmentBrief(userId: string, taxYear: number): Promise<AdvisorAssessmentBrief> {
    const empty: AdvisorAssessmentBrief = { recorded: false, status: 'nicht erfasst', deviations: [], calculationIncomplete: false, appealDaysLeft: null }
    if (!this.assessmentService) return empty
    const state = await this.assessmentService.getState(userId, taxYear).catch(() => null)
    if (state === null || !state.fields.some((field) => field.kind === 'erfasst')) return empty
    return {
      recorded: true,
      status: state.status,
      deviations: state.reconciliation.deviations.map((d) => ({ field: d.field, assessedEur: d.assessment, calculatedEur: d.calculated, differenceEur: d.difference })),
      calculationIncomplete: state.reconciliation.calculationIncomplete,
      appealDaysLeft: state.frist.remainingDays,
    }
  }

  /**
   * Turbo mode: the owl applies what it prepared in this answer. The answer is already saved and
   * complete, so a failed apply only leaves the drafts to the user.
   */
  private async applyTurbo(userId: string, taxYear: number, runId: string, dto: SendAdvisorMessageDto, assistant: AdvisorChatMessageRecord): Promise<AdvisorChatMessageRecord | null> {
    if (!dto.turbo) return null
    return this.drafts.applyPendingOf(userId, taxYear, assistant).catch((error: unknown) => {
      this.logger.warn(`turbo apply for ${runId} failed: ${error instanceof Error ? error.name : 'unknown'}`)
      return null
    })
  }

  async applyAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.drafts.applyAction(userId, taxYear, actionId)
  }

  async applyBatch(userId: string, taxYear: number, dto: ApplyBatchActionsDto): Promise<ApplyBatchActionsResponseDto> {
    return this.drafts.applyBatch(userId, taxYear, dto)
  }

  async undoAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.drafts.undoAction(userId, taxYear, actionId)
  }

  async dismissAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.drafts.dismissAction(userId, taxYear, actionId)
  }

  /**
   * What a draft would do to the refund, by the app's own estimate: once for the stored return,
   * once with the draft's fields written — inside a transaction that is always rolled back, so
   * the preview runs through the very write path „Übernehmen“ uses and leaves nothing behind.
   * Only offered where a real transaction exists; in-memory setups keep the approximation.
   */
  previewEffectFor(userId: string, taxYear: number): ((target: AdvisorPreviewTarget) => Promise<AdvisorPreviewEffect>) | undefined {
    const estimate = this.taxEstimate
    if (!estimate || this.transactions === passThroughTransactionRunner) return undefined
    return async (target) => {
      // The estimate leaves § 35a and § 33 out while their boosters are off (#443 slice 5): a draft
      // there would show 0 € and read as "brings nothing", which is not true.
      const leftOut = effectLeftOutOfEstimate(target, HOUSEHOLD_AND_HEALTH_BOOSTERS)
      if (leftOut) return leftOut
      let states: { before: TaxEstimateStatus; after: TaxEstimateStatus } | null = null
      try {
        // Person B's fields are written where B's data lives; the estimate is the couple's, read for the user.
        const dataUserId = await this.drafts.dataUserFor(userId, taxYear, target)
        const personalDataConsent = await this.hasPersonalDataConsent(userId)
        await this.transactions.run(async () => {
          const before = await estimate.getState(userId, taxYear)
          for (const [field, value] of target.values) {
            await this.confirmationService.writeConfirmedByAdvisor(dataUserId, taxYear, provenanceKey(target.screen, field, target.instance ?? undefined), value, undefined, undefined, { personalDataConsent })
          }
          states = { before, after: await estimate.getState(userId, taxYear) }
          throw new PreviewRollback()
        })
      } catch (error) {
        if (!(error instanceof PreviewRollback)) {
          this.logger.warn(`effect preview failed for ${target.screen}: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`)
          return { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
        }
      }
      return effectFromEstimates(states)
    }
  }

  // ── Project notes (#481) ──────────────────────────────────────────────────────────────────

  async getSession(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorSessionResponseDto> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const [setting, cardsRes, history, conversations, notes] = await Promise.all([
      this.owlModeService.getSetting(userId),
      this.owlModeService.getCards(userId, taxYear),
      this.advisorRepo.listForConversation(conversation.id, userId),
      this.advisorRepo.listConversations(userId, taxYear),
      this.advisorRepo.listNotes(userId, taxYear),
    ])

    await this.auditService.append({
      userId,
      action: 'READ',
      resource: 'berater_sitzung',
    })

    const allConversations = await this.advisorRepo.listAllConversations(userId)
    const answering = new Set(await this.advisorRepo.answeringConversationIds(userId, new Date(Date.now() - ANSWERING_WINDOW_MS)))
    const openCount = cardsRes.cards.length
    const greeting =
      openCount > 0
        ? `Hallo! Ich habe deine Steuerakte ${taxYear} durchgesehen und ${openCount} konkrete Spar-${openCount === 1 ? 'Chance' : 'Chancen'} vorbereitet. Wollen wir sie kurz gemeinsam klären oder möchtest du eine eigene Frage stellen?`
        : `Hallo! Deine Steuerakte ${taxYear} sieht bereits sehr aufgeräumt aus. Frag mich jederzeit zu Abzügen, Belegen, Paragraphen oder starte die Kanzlei-Endprüfung vor dem Ausdruck.`

    return {
      enabled: setting.enabled,
      greeting,
      openCards: cardsRes.cards,
      conversationId: conversation.id,
      conversations: conversations.map((c) => toConversationDto(c, answering.has(c.id))),
      projects: projectsOf(taxYear, allConversations, answering),
      context: contextOf(conversation, history, await this.knownNamesForScrubbing(userId, taxYear)),
      notes: notes.map(toNoteDto),
      situation: await this.notes.getSituation(userId),
      messages: history.filter((m) => !m.meta?.replaced).map(toMessageDto),
      quickChips: [
        'Kanzlei-Endprüfung starten',
        'Homeoffice vs. Arbeitszimmer prüfen',
        'Fortbildung & Reisekosten klären',
        'Spenden aus dem Vorjahr prüfen',
      ],
      legalSources: Object.values(ADVISOR_LEGAL_SOURCES),
    }
  }

  async sendMessage(
    userId: string,
    taxYear: number,
    dto: SendAdvisorMessageDto,
  ): Promise<SendAdvisorMessageResponseDto> {
    let finalResponse: SendAdvisorMessageResponseDto | null = null
    for await (const event of this.streamMessage(userId, taxYear, dto)) {
      if (event.event === 'error') throw new UnavailableError(event.data.code, event.data.message)
      if (event.event === 'done') {
        finalResponse = event.data as SendAdvisorMessageResponseDto
      }
    }
    if (!finalResponse) {
      throw new InvalidInputError('ADVISOR_EMPTY_TURN', 'Der Berater-Assistent konnte keine Antwort erzeugen.')
    }
    return finalResponse
  }

  /**
   * Everything that can still fail as plain HTTP (quota) and everything the turn needs up front.
   * Both messages exist afterwards: the question, and the answer as `streaming` (#476).
   */
  async prepareTurn(userId: string, taxYear: number, dto: SendAdvisorMessageDto): Promise<PreparedAdvisorTurn> {
    const { dailyMessageLimit } = this.runtimeConfig ? await this.runtimeConfig.resolveLimits() : DEFAULT_AI_TURN_LIMITS
    const startOfDayUtc = new Date()
    startOfDayUtc.setUTCHours(0, 0, 0, 0)
    const todayCount = await this.advisorRepo.countUserMessagesSince(userId, startOfDayUtc)
    if (todayCount >= dailyMessageLimit) {
      throw new TooManyRequestsError(
        'ADVISOR_DAILY_LIMIT_EXCEEDED',
        `Du hast dein Tageskontingent von ${dailyMessageLimit} Nachrichten an die SteuerEule erreicht. Morgen früh steht dir deine Eule wieder frisch zur Verfügung.`,
      )
    }

    // Ensure Eulen-Modus is enabled when user actively chats with the Eule
    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    // Double PII Shield: scrub known names, Steuer-IDs, IBANs, emails, and phones from user free-text & history.
    // With the user's consent to personal data nothing is masked (ADR-0091); it is read fresh, so a revocation counts at once.
    const consent = await this.hasPersonalDataConsent(userId)
    const knownNames = consent ? [] : await this.knownNamesForScrubbing(userId, taxYear)
    const isOpening = dto.quickAction === 'opening'
    // The spouse's name becomes the handle the owl drafts for („Person B“), not an anonymous stand-in.
    const spouse = isOpening ? null : await this.link?.spouseForAdvisor(userId, taxYear)
    // A last name the couple shares stays a stand-in: it would turn the user into „Person B“ too.
    const ownProfile = isOpening ? null : await this.profileRepo?.findByUserId(userId)
    const spouseNames = consent ? [] : [spouse?.firstName, spouse?.lastName !== ownProfile?.lastName ? spouse?.lastName : null].filter((name): name is string => !!name)
    const maskedText = isOpening ? OPENING_PLACEHOLDER : scrubUserMessagePii(replaceNamesWith(dto.message.trim(), spouseNames, PERSON_B_HANDLE), knownNames)
    const scrubbedUserText = consent && !isOpening ? dto.message.trim() : maskedText
    // What the masking took out tells the owl's answer to offer the consent (ADR-0091); a spouse name turned into „Person B“ does not.
    const maskedPersonalData = !consent && !isOpening && scrubUserMessagePii(dto.message.trim(), knownNames) !== dto.message.trim()
    const conversation = await this.conversationFor(userId, taxYear, dto.conversationId)
    // Conversations answer side by side (#503), but one conversation has one answer at a time:
    // two would write into the same history in an order nobody chose.
    if ((await this.advisorRepo.answeringConversationIds(userId, new Date(Date.now() - ANSWERING_WINDOW_MS))).includes(conversation.id)) {
      throw new ConflictError('ADVISOR_CONVERSATION_BUSY', 'In diesem Gespräch schreibt die Eule gerade schon an einer Antwort. Warte kurz oder stoppe sie.')
    }
    if (dto.replaceFromMessageId !== undefined) {
      await this.replaceLatestTurn(userId, conversation.id, dto.replaceFromMessageId)
    }
    // The model sees this conversation only; what the conversations share is the return itself.
    const priorRecords = liveMessages(conversation, await this.advisorRepo.listForConversation(conversation.id, userId))
    const opening = isOpening ? await this.prepareOpening(userId, taxYear, priorRecords.length) : undefined
    const lastAnswer = priorRecords.filter((record) => record.role === 'assistant').at(-1)
    const fromApp = isOpening || isOfferedChoice(dto.message, lastAnswer?.meta)
    const sources = historySources(priorRecords, knownNames, spouseNames, consent)
    // A full context is summarised before the answer, once the stream is open (see executeTurn).
    const needsSummary = advisorContextUsage(sources, conversation.summary).level === 'full'
    await this.advisorRepo.updateConversation(conversation.id, userId, {
      lastUsedAt: new Date(),
      // The first question names the conversation; an opening names it after what it is.
      ...(conversation.title === null ? { title: isOpening ? `Einschätzung ${taxYear}` : titleFrom(scrubbedUserText) } : {}),
    })
    const history = buildAdvisorHistory(sources, { summary: conversation.summary })

    const runId = randomUUID()
    const userMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      conversationId: conversation.id,
      role: 'user',
      content: scrubbedUserText,
      meta: opening ? { opening: opening.marker } : null,
    })
    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      meta: null,
      status: 'streaming',
      runId,
    })

    // Whether the owl's last drafts were just taken over, and which printout gaps it asked then (ADR-0091, Nachtrag).
    const previousAnswer = lastAnswer ? { draftsApplied: draftsTakenOver(lastAnswer.meta), ...(lastAnswer.meta?.printoutGapsAsked ? { printoutGapsAsked: lastAnswer.meta.printoutGapsAsked } : {}) } : undefined
    return { runId, userMessage, assistantMessageId: assistantMessage.id, scrubbedUserText, history, dto, conversationId: conversation.id, needsSummary, fromApp, personalDataConsent: consent, maskedPersonalData, ...(previousAnswer ? { previousAnswer } : {}), ...(opening ? { opening } : {}) }
  }

  /** An opening needs something to talk about and an empty conversation. */
  private async prepareOpening(userId: string, taxYear: number, priorMessages: number): Promise<NonNullable<PreparedAdvisorTurn['opening']>> {
    if (priorMessages > 0) throw new InvalidInputError('ADVISOR_OPENING_NOT_EMPTY', 'Die Eule eröffnet nur ein neues, leeres Gespräch.')
    const context = await this.opening.context(userId, taxYear)
    if (context.stage === 'empty') throw new InvalidInputError('ADVISOR_OPENING_NOTHING_KNOWN', 'Für dieses Steuerjahr ist noch nichts erfasst. Beginne mit dem Interview.')
    return { marker: { fingerprint: context.fingerprint, stage: context.stage }, context }
  }

  async *streamMessage(
    userId: string,
    taxYear: number,
    dto: SendAdvisorMessageDto,
    signal?: AbortSignal,
  ): AsyncIterable<AdvisorStreamEvent> {
    // The quota is checked before the stream opens, so a 429 still reaches the client as plain HTTP.
    const turn = await this.prepareTurn(userId, taxYear, dto)
    yield* this.executeTurn(userId, taxYear, turn, signal)
  }

  /**
   * Runs a prepared turn to one of its final states. Whatever happens (stop, timeout, a thrown
   * error, a consumer that walks away), the answer never stays `streaming`.
   */
  async *executeTurn(
    userId: string,
    taxYear: number,
    turn: PreparedAdvisorTurn,
    signal?: AbortSignal,
  ): AsyncIterable<AdvisorStreamEvent> {
    const startedAt = Date.now()
    const { runId, userMessage, assistantMessageId, scrubbedUserText, dto } = turn
    let text = ''
    let reasoning = ''
    let steps: readonly AdvisorThoughtStep[] = []
    let firstTokenMs: number | null = null
    let finished = false

    const finish = async (
      status: FinishAdvisorMessageInput['status'],
      content: string,
      meta: AdvisorMessageMeta,
      usage?: AdvisorTurnUsage,
    ): Promise<AdvisorChatMessageRecord> => {
      finished = true
      const fullMeta: AdvisorMessageMeta = { ...meta, ...(steps.length > 0 ? { thoughtSteps: steps } : {}) }
      const usageRecord: AdvisorMessageUsage = { ...usage, traceId: runId, firstTokenMs, durationMs: Date.now() - startedAt }
      const record = await this.advisorRepo.finishMessage(assistantMessageId, userId, {
        content,
        meta: Object.keys(fullMeta).length > 0 ? fullMeta : null,
        status,
        reasoning: reasoning.length > 0 ? reasoning : null,
        usage: usageRecord,
      })
      this.logger.log(
        JSON.stringify({
          msg: 'advisor_turn',
          traceId: runId,
          status,
          engine: meta.engine?.mode ?? null,
          provider: meta.engine?.provider ?? null,
          model: meta.engine?.model ?? null,
          topicVerdict: meta.engine?.topic?.verdict ?? null,
          topicCategory: meta.engine?.topic && 'category' in meta.engine.topic ? meta.engine.topic.category : null,
          topicUnavailable: meta.engine?.topic && 'reason' in meta.engine.topic ? meta.engine.topic.reason : null,
          firstTokenMs,
          durationMs: usageRecord.durationMs,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          cachedInputTokens: usage?.cachedInputTokens ?? null,
        }),
      )
      return record
    }

    const doneWith = (assistant: AdvisorChatMessageRecord, mode: SendAdvisorMessageResponseDto['mode']): AdvisorStreamEvent => ({
      event: 'done',
      data: {
        userMessage: toMessageDto(userMessage),
        assistantMessage: toMessageDto(assistant),
        mode,
      } satisfies SendAdvisorMessageResponseDto,
    })

    try {
      yield { event: 'start', data: { runId, userMessage: toMessageDto(userMessage), assistantMessageId } }

      let history = turn.history
      if (turn.needsSummary) {
        const status: AdvisorStreamEvent = { event: 'status', data: { text: 'Die Eule fasst den älteren Verlauf zusammen …' } }
        steps = foldThoughtEvent(steps, status)
        yield status
        history = await this.conversations.summarizeForTurn(userId, taxYear, turn, signal)
      }

      // Build PII-free CaseDigest & stream Zero-Write advisor turn via LangGraph engine (with deterministic fallback)
      const digest = await this.buildCaseDigest(userId, taxYear)
      const actionIdFactory = newActionId

      if (!this.advisorEngine) {
        const fallback = evaluateAdvisorTurn({
          message: scrubbedUserText,
          activeScreen: dto.activeScreen,
          digest,
          actionIdFactory,
        })

        // The rules' drafts name the effect the real estimate computes, or none (K3).
        const previewed = await withPreviewedEffects(fallback.meta, this.previewEffectFor(userId, taxYear))
        const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, previewed)
        await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

        const status: AdvisorStreamEvent = { event: 'status', data: { text: 'Eule prüft deine Akte & Paragraphen …' } }
        steps = foldThoughtEvent(steps, status)
        yield status
        firstTokenMs = Date.now() - startedAt
        const rulesFollowUp = turn.opening
          ? { text: '', meta: {} }
          : printoutFollowUp({
              plan: digest.furtherFacts?.printoutPlan,
              message: scrubbedUserText,
              reply: fallback.replyText,
              meta: enrichedMeta,
              records: await this.loadRecordHandles(userId, taxYear),
              previous: turn.previousAnswer,
              subjectLabels: await this.childLabels(userId, taxYear, turn.personalDataConsent === true),
            })
        const replyText = fallback.replyText + rulesFollowUp.text
        yield { event: 'token', data: { text: replyText } }
        if (enrichedMeta.choices && enrichedMeta.choices.length > 0) {
          yield { event: 'choices', data: { choices: enrichedMeta.choices } }
        }
        if (enrichedMeta.action) {
          yield { event: 'action', data: toPublicAction(enrichedMeta.action) }
        }
        if (enrichedMeta.twoPaths) {
          yield { event: 'twoPaths', data: toPublicMeta({ twoPaths: enrichedMeta.twoPaths }).twoPaths! }
        }
        const assistant = await finish('complete', replyText, { ...enrichedMeta, ...rulesFollowUp.meta, ...(turn.maskedPersonalData ? { personalDataConsentRequest: true as const } : {}), engine: DETERMINISTIC_ENGINE })
        yield doneWith((await this.applyTurbo(userId, taxYear, runId, dto, assistant)) ?? assistant, 'deterministic_fallback')
        return
      }

      const task = dto.quickAction === 'savings_plan' ? ('savings-plan' as const) : dto.quickAction === 'assessment_check' ? ('assessment-check' as const) : undefined
      const request: AdvisorTurnRequest = {
        message: scrubbedUserText,
        activeScreen: dto.activeScreen,
        digest,
        history,
        actionIdFactory,
        signal,
        // Every quick start is work in several steps: the plan shows the user what the owl is doing.
        planRequired: dto.quickAction !== undefined,
        ...(task ? { task } : {}),
        situation: (await this.notes.getSituation(userId)).text,
        ...(task === 'assessment-check' ? { assessment: await this.assessmentBrief(userId, taxYear) } : {}),
        ...(dto.skill ? { skill: dto.skill } : {}),
        ...(dto.skill === 'berater-interview' ? { interview: await this.advisorRepo.findInterview(userId, taxYear) } : {}),
        topicCheck: turn.fromApp ? 'skip' : 'check',
        personalDataConsent: turn.personalDataConsent === true,
        records: await this.loadRecordHandles(userId, taxYear),
        household: await this.advisorHousehold(userId, taxYear),
        previewEffect: this.previewEffectFor(userId, taxYear),
        notes: buildNoteHandles(await this.advisorRepo.listNotes(userId, taxYear)),
      }
      const events = turn.opening
        ? openingStream(this.advisorEngine, request, await this.opening.brief(userId, taxYear, turn.opening.context))
        : this.advisorEngine.streamTurn(request)
      for await (const ev of events) {
        if (ev.event === 'token') {
          firstTokenMs ??= Date.now() - startedAt
          text += ev.data.text
        } else if (ev.event === 'reasoning') {
          reasoning += ev.data.text
        } else {
          steps = foldThoughtEvent(steps, ev)
        }

        if (ev.event === 'action') {
          const enriched = await this.drafts.enrichSingleDraft(userId, taxYear, ev.data)
          // A recorded value the user did not ask to change is not shown as a draft (ADR-0082).
          if (holdUnaskedOverwrites([enriched], scrubbedUserText).kept.length === 0) continue
          yield { event: 'action', data: toPublicAction(enriched) }
          continue
        }

        if (ev.event === 'twoPaths') {
          const [safePath, maxPath] = await Promise.all([
            this.drafts.enrichSingleDraft(userId, taxYear, ev.data.safePath),
            this.drafts.enrichSingleDraft(userId, taxYear, ev.data.maxPath),
          ])
          yield {
            event: 'twoPaths',
            data: {
              ...ev.data,
              safePath: toPublicAction(safePath),
              maxPath: toPublicAction({ ...maxPath, evidenceHint: ev.data.maxPath.evidenceHint }),
            },
          }
          continue
        }

        if (ev.event === 'error') {
          this.modelConnection?.recordTurn(ev.data.failure ?? null)
          // Half an answer is kept for the record, but never as if it were complete.
          await finish('failed', text, ev.data.failure ? { modelFailure: ev.data.failure } : {})
          yield ev
          return
        }

        if (ev.event === 'done') {
          const turnResult = ev.data as AdvisorTurnResult
          // What the model did this turn is the best news about the connection there is.
          if (turnResult.mode === 'langgraph' || turnResult.meta.modelFailure) this.modelConnection?.recordTurn(turnResult.primaryFailure ?? turnResult.meta.modelFailure ?? null)
          const { meta: enrichedMeta, note: heldNote } = guardModelDrafts(await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, turnResult.meta), scrubbedUserText)
          await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

          const engine: AdvisorEngineInfo = {
            mode: turnResult.mode,
            ...(turnResult.provider !== undefined ? { provider: turnResult.provider } : {}),
            ...(turnResult.model !== undefined ? { model: turnResult.model } : {}),
            // Counted per user and day from here, as verdict and category only, never the text (ADR-0069).
            ...(turnResult.topic !== undefined ? { topic: turnResult.topic } : {}),
          }
          if (reasoning.length === 0 && turnResult.reasoning) reasoning = turnResult.reasoning
          const noteChanges = await this.notes.applyNoteChanges(userId, taxYear, enrichedMeta.noteChanges)
          if (enrichedMeta.interviewChanges && enrichedMeta.interviewChanges.length > 0) {
            await this.advisorRepo.saveInterview(userId, taxYear, applyInterviewChanges(await this.advisorRepo.findInterview(userId, taxYear), enrichedMeta.interviewChanges))
          }
          const { noteChanges: _asProposed, interviewChanges: _stored, ...metaWithoutNotes } = enrichedMeta
          // What still blocks the printout, asked by the app when the model left it out (ADR-0091, Nachtrag).
          const gapFollowUp = turn.opening
            ? { text: '', meta: {} }
            : printoutFollowUp({
                plan: digest.furtherFacts?.printoutPlan,
                message: scrubbedUserText,
                reply: turnResult.replyText,
                meta: enrichedMeta,
                records: request.records,
                previous: turn.previousAnswer,
                subjectLabels: await this.childLabels(userId, taxYear, turn.personalDataConsent === true),
              })
          const assistant = await finish(
            'complete',
            turnResult.replyText + heldNote + gapFollowUp.text,
            {
              ...metaWithoutNotes,
              ...gapFollowUp.meta,
              ...(noteChanges.length > 0 ? { noteChanges } : {}),
              ...(turn.opening ? { opening: turn.opening.marker } : {}),
              ...(turn.maskedPersonalData ? { personalDataConsentRequest: true as const } : {}),
              engine,
            },
            turnResult.usage,
          )
          // An opening prepares no drafts, so there is nothing for Turbo to apply.
          const turbo = turn.opening ? null : await this.applyTurbo(userId, taxYear, runId, dto, assistant)
          yield doneWith(turbo ?? assistant, turnResult.mode)
          return
        }

        yield ev
      }

      // The engine ended without a verdict: a stop keeps the partial text, anything else is a failure.
      if (signal?.aborted) {
        const assistant = await finish('aborted', text, {})
        yield doneWith(assistant, 'langgraph')
        return
      }
      await finish('failed', text, {})
      yield { event: 'error', data: { code: 'ADVISOR_TURN_FAILED', message: TURN_FAILED_MESSAGE } }
    } catch (error) {
      if (finished) throw error
      // The client only hears "broke off"; operations need the reason, without any message content.
      if (!signal?.aborted) {
        this.logger.error(`advisor turn ${runId} failed: ${error instanceof Error ? `${error.name}: ${error.message.slice(0, 400)}` : String(error).slice(0, 400)}`)
      }
      await finish(signal?.aborted ? 'aborted' : 'failed', text, {})
      yield {
        event: 'error',
        data:
          error instanceof DomainError
            ? { code: error.code, message: error.message }
            : { code: 'ADVISOR_TURN_FAILED', message: TURN_FAILED_MESSAGE },
      }
    } finally {
      // The consumer stopped reading (connection gone, loop left): nothing may stay `streaming`.
      if (!finished) await finish('aborted', text, {}).catch(() => {})
    }
  }

  async setFeedback(
    userId: string,
    taxYear: number,
    messageId: string,
    dto: { readonly rating: AdvisorFeedbackRating | null; readonly reason?: AdvisorFeedbackReason | undefined },
  ): Promise<AdvisorChatMessageDto> {
    const message = await this.advisorRepo.findMessage(messageId, userId)
    if (!message || message.taxYear !== taxYear) {
      throw new NotFoundError('ADVISOR_MESSAGE_NOT_FOUND', 'Diese Nachricht gibt es nicht (mehr).')
    }
    if (message.role !== 'assistant' || message.status === 'streaming') {
      throw new InvalidInputError('ADVISOR_FEEDBACK_NOT_RATEABLE', 'Bewerten lassen sich nur fertige Antworten der Eule.')
    }
    const feedback: AdvisorMessageFeedback | null =
      dto.rating === null
        ? null
        : { rating: dto.rating, ...(dto.rating === 'down' && dto.reason !== undefined ? { reason: dto.reason } : {}) }
    const updated = await this.advisorRepo.setFeedback(messageId, userId, feedback)
    if (!updated) throw new NotFoundError('ADVISOR_MESSAGE_NOT_FOUND', 'Diese Nachricht gibt es nicht (mehr).')
    return toMessageDto(updated)
  }

  /**
   * Empties one conversation and keeps it. Values already applied to the return stay; proposals
   * that were still open disappear with the messages that carried them.
   */
  async clearConversation(userId: string, taxYear: number, conversationId?: string): Promise<{ deletedMessages: number }> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const deletedMessages = await this.advisorRepo.deleteMessagesOfConversation(conversation.id, userId)
    await this.advisorRepo.updateConversation(conversation.id, userId, { title: null, summary: null, summaryUntil: null })
    await this.auditService.append({ userId, action: 'WRITE', resource: 'berater_verlauf_geloescht' })
    return { deletedMessages }
  }

  /**
   * Regenerate / edit-and-resend (#451 slice 1b): the latest user message and everything after it
   * leave the chat. Proposals still pending there are dismissed so they can never be applied;
   * applied ones stay applied (their undo still works from the cockpit history).
   */
  private async replaceLatestTurn(userId: string, conversationId: string, userMessageId: string): Promise<void> {
    const visible = (await this.advisorRepo.listForConversation(conversationId, userId)).filter((m) => !m.meta?.replaced)
    const lastUserIndex = visible.map((m) => m.role).lastIndexOf('user')
    if (lastUserIndex === -1 || visible[lastUserIndex]!.id !== userMessageId) {
      throw new InvalidInputError('ADVISOR_REPLACE_NOT_LATEST', 'Nur die letzte Frage lässt sich neu stellen oder bearbeiten.')
    }
    const dismiss = <A extends AdvisorActionProposal>(a: A): A => (a.status === 'pending' ? { ...a, status: 'dismissed' } : a)
    await this.transactions.run(async () => {
      for (const record of visible.slice(lastUserIndex)) {
        const meta = record.meta ?? {}
        await this.advisorRepo.updateMessageMeta(record.id, userId, {
          ...meta,
          ...(meta.action ? { action: dismiss(meta.action) } : {}),
          ...(meta.actions ? { actions: meta.actions.map(dismiss) } : {}),
          ...(meta.twoPaths ? { twoPaths: { ...meta.twoPaths, safePath: dismiss(meta.twoPaths.safePath), maxPath: dismiss(meta.twoPaths.maxPath) } } : {}),
          replaced: true,
        })
      }
    })
  }

  async stageReceiptProposal(
    userId: string,
    taxYear: number,
    input: {
      readonly screen: Screen
      readonly field: string
      readonly newValue: string
      readonly companionFields?: Readonly<Record<string, string>> | undefined
      readonly label: string
      readonly reason: string
      readonly sourceId: OwlSourceId
      readonly summaryText: string
      readonly engine: AdvisorEngineInfo
      /** The stored Beleg this proposal was read from: applying it records `{ kind: 'beleg' }` provenance. */
      readonly receiptId?: string | null | undefined
      /** The donations this receipt adds (hashed, ADR-0080); the draft carries them with those still waiting. */
      readonly countedItems?: readonly AdvisorCountedItem[] | undefined
      /** A receipt read from a photo or scan is never offered as read (ADR-0060). */
      readonly fromOcr?: boolean | undefined
      /** Whose Werbungskosten they are (ADR-0092 §2): B's go to B's own record. */
      readonly person?: 'A' | 'B' | undefined
      /** Whose data the draft writes: B's record for Person B. */
      readonly digestUserId?: string | undefined
      /** Issuer (hashed), amount and date of the receipt, to tell the same one again from another (§6). */
      readonly receiptMark?: ReceiptMark | undefined
    },
  ): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    assertAiWritable(input.screen, input.field)
    for (const companionField of Object.keys(input.companionFields ?? {})) assertAiWritable(input.screen, companionField)
    checkPiiFree(input)

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const person = input.person ?? 'A'
    const dataUserId = input.digestUserId ?? userId
    const digest = await this.buildCaseDigest(dataUserId, taxYear)
    const counted = input.countedItems
    const proposal = (value: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => {
      const sim = simulateAdvisorFieldDelta(digest, input.screen, input.field, value)
      return {
        actionId: newActionId(),
        status: 'pending',
        screen: input.screen,
        field: input.field,
        instance: null,
        // Person B's Werbungskosten go into B's own record (ADR-0092 §2).
        ...(person === 'B' ? { person: 'B' as const } : {}),
        ...(input.companionFields ? { companionFields: input.companionFields } : {}),
        label: input.label,
        previousValue: sim.previousValue,
        expectedPreviousValue: sim.previousValue,
        newValue: value,
        beforeRefundEur: sim.beforeRefundEur,
        afterRefundEur: sim.afterRefundEur,
        deltaEur: sim.deltaEur,
        reason: input.reason,
        sourceId: input.sourceId,
        paragraph: ADVISOR_LEGAL_SOURCES[input.sourceId].paragraph,
        ...(input.receiptId ? { receiptId: input.receiptId } : {}),
        ...(input.fromOcr ? { confidenceStatus: 'pruefen' as const, fieldReason: 'ocr_source' as const } : {}),
        ...(counted ? { countedItems: counted } : {}),
        ...(input.receiptMark ? { receiptMark: input.receiptMark } : {}),
        ...extra,
      }
    }
    const target = { screen: input.screen, field: input.field, person }
    const existing = /^\d+$/.test(input.newValue) ? await this.existingAmount(userId, taxYear, dataUserId, target, input.receiptId ?? null) : null
    // A sum's companions (a craftsman's invoice total) add up with it.
    const companionsAdded = async (): Promise<Record<string, string> | undefined> => {
      if (!input.companionFields) return undefined
      const entries: [string, string][] = []
      for (const [field, value] of Object.entries(input.companionFields)) {
        const key = `${input.screen}.${field}`
        if (!ACCUMULATING_KEYS.has(key) || !/^\d+$/.test(value)) {
          entries.push([field, value])
          continue
        }
        const base = existing?.companions?.[field] ?? (await this.confirmationService.readRawValue(dataUserId, taxYear, key).catch(() => null))
        entries.push([field, base !== null && base !== undefined && /^\d+$/.test(base) ? addAmounts(base, value) : value])
      }
      return Object.fromEntries(entries)
    }
    // A year's total built from several receipts (ADR-0092 §6): another receipt adds up without a question,
    // the same receipt again (a copy, a correction) asks „zusätzlich oder ersetzen?“. A field that holds one
    // value (a premium, a wage) asks whenever another source is in it.
    const sumField = ACCUMULATING_KEYS.has(`${input.screen}.${input.field}`)
    const how =
      existing === null
        ? 'write'
        : sumField
          ? sumFieldCombination(existing.value, input.newValue, existing.source, input.receiptMark !== undefined && sameReceiptAgain(input.receiptMark, existing.marks))
          : amountCombination(existing.value, input.newValue, existing.source)
    const drafts: AdvisorActionProposal[] = []
    if (how === 'write') drafts.push(proposal(input.newValue))
    else if (how === 'add') {
      const companions = await companionsAdded()
      const sum = addAmounts(existing!.value!, input.newValue)
      drafts.push(
        proposal(sum, {
          reason: `${input.reason} Bisher ${existing!.value} €, dieser Beleg ${input.newValue} €: zusammen ${sum} €.`,
          ...(companions ? { companionFields: companions } : {}),
          ...(counted ? { countedItems: [...existing!.counted, ...counted] } : {}),
        }),
      )
    } else {
      const [add, replace] = combinationDrafts(proposal, input.label, existing!, input.newValue, counted)
      const companions = await companionsAdded()
      drafts.push({ ...add, ...(companions ? { companionFields: companions } : {}) }, replace)
    }

    // One draft, or the two ways „zusätzlich“ / „ersetzen“ as alternatives of one answer.
    const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, {
      sources: [input.sourceId],
      ...(drafts.length === 1 ? { action: drafts[0]! } : { actions: drafts }),
    })

    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })

    return {
      action: toPublicAction((enrichedMeta.action ?? enrichedMeta.actions?.[0])!),
      assistantMessage: toMessageDto(assistantMessage),
    }
  }

  async stageLstbScanBatch(
    userId: string,
    taxYear: number,
    input: {
      readonly digestUserId?: string | undefined
      readonly receiptId: string | null
      readonly stage: 'deterministic' | 'llm_text_fallback'
      readonly taxYearOnDocument: number | null
      readonly person?: 'A' | 'B' | undefined
      /** Offer „zusätzlich“ and „ersetzen“ where a value is recorded already (the chat; the mask asks itself). */
      readonly askCombination?: boolean | undefined
      readonly engine: AdvisorEngineInfo
      readonly summaryText: string
      readonly fields: ReadonlyArray<{
        readonly field: WageTaxCertificateFieldId
        readonly label: string
        readonly extracted: LstbExtractedField
      }>
    },
  ): Promise<{ actions: AdvisorActionProposal[]; assistantMessage: AdvisorChatMessageDto }> {
    for (const item of input.fields) {
      assertAiWritable('lstb', item.field)
    }

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const digest = await this.buildCaseDigest(input.digestUserId ?? userId, taxYear)
    const rawActions: AdvisorActionProposal[] = []
    // The drafts the LStB mask takes over itself; an alternative „zusätzlich“ is the chat's own choice.
    const scanActionIds: string[] = []
    for (const item of input.fields) {
      const valueStr = item.extracted.value !== null ? String(item.extracted.value) : ''
      const draft = (value: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => {
        const sim = item.extracted.value !== null ? simulateAdvisorFieldDelta(digest, 'lstb', item.field, value) : { previousValue: null, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0 }
        return {
          actionId: newActionId(),
          status: 'pending',
          screen: 'lstb',
          field: item.field,
          instance: null,
          // A partner's LStB writes into B's record and must not replace the user's own drafts.
          ...(input.person === 'B' ? { person: 'B' as const } : {}),
          label: item.label,
          previousValue: sim.previousValue,
          expectedPreviousValue: sim.previousValue,
          newValue: value,
          beforeRefundEur: sim.beforeRefundEur,
          afterRefundEur: sim.afterRefundEur,
          deltaEur: sim.deltaEur,
          reason: describeLstbCalculation(item.extracted.calculation),
          sourceId: 'estg-9-1',
          paragraph: ADVISOR_LEGAL_SOURCES['estg-9-1'].paragraph,
          ...(input.receiptId ? { receiptId: input.receiptId } : {}),
          confidenceStatus: item.extracted.status,
          sourceLines: item.extracted.sourceLines,
          calculation: item.extracted.calculation,
          fieldReason: item.extracted.reason,
          ...extra,
        }
      }
      // The mask asks „hinzufügen oder ersetzen“ itself; the chat gets both ways as drafts (ADR-0092 §6).
      const existing =
        input.askCombination === true && item.extracted.value !== null
          ? await this.existingAmount(userId, taxYear, input.digestUserId ?? userId, { screen: 'lstb', field: item.field, person: input.person ?? 'A' }, input.receiptId)
          : null
      if (existing === null || amountCombination(existing.value, valueStr, existing.source) === 'write') {
        const plain = draft(valueStr)
        rawActions.push(plain)
        scanActionIds.push(plain.actionId)
        continue
      }
      const [add, replace] = combinationDrafts(draft, item.label, existing, valueStr, undefined)
      rawActions.push(add, replace)
      scanActionIds.push(replace.actionId)
    }

    const initialMeta: AdvisorMessageMeta = {
      sources: ['estg-9-1'],
      actions: rawActions,
      lstbScan: {
        receiptId: input.receiptId,
        stage: input.stage,
        taxYearOnDocument: input.taxYearOnDocument,
        ...(input.person !== undefined ? { person: input.person } : {}),
        actionIds: scanActionIds,
      },
    }

    const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, initialMeta)
    checkPiiFree(enrichedMeta)
    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })

    return {
      actions: (enrichedMeta.actions ?? []).map((a) => toPublicAction(a)),
      assistantMessage: toMessageDto(assistantMessage),
    }
  }

  /**
   * The names on record for Person A and, in a joint return, Person B: only to tell whose document
   * an upload is. They never go into a draft, a message or a prompt.
   */
  async householdNames(
    userId: string,
    taxYear: number,
  ): Promise<{ A: { firstName: string | null; lastName: string | null }; B: { firstName: string | null; lastName: string | null; recordable: boolean } | null }> {
    const [profile, spouse] = await Promise.all([this.profileRepo?.findByUserId(userId), this.link?.spouseForAdvisor(userId, taxYear)])
    return {
      A: { firstName: profile?.firstName ?? null, lastName: profile?.lastName ?? null },
      B: spouse ? { firstName: spouse.firstName, lastName: spouse.lastName, recordable: spouse.recordable } : null,
    }
  }

  /**
   * The household of the year for the assignment of documents (ADR-0092): A, B in a joint return and the
   * children, with the names on record. Only to tell whose a document is; never in a draft or a prompt.
   */
  async householdMembers(userId: string, taxYear: number): Promise<AssignmentMember[]> {
    const names = await this.householdNames(userId, taxYear)
    const children = (await this.childRepo?.listForUserAndYear(userId, taxYear)) ?? []
    return [
      { ref: 'A', ...names.A },
      ...(names.B ? [{ ref: 'B' as const, firstName: names.B.firstName, lastName: names.B.lastName }] : []),
      ...children.map((c) => ({ ref: `kind:${c.id}` as const, firstName: c.firstName || null, lastName: c.lastName || null })),
    ]
  }

  /**
   * Drafts read from an uploaded document, for Person A or B, in one owl message (Zero-Write: nothing
   * is written until the user applies them). The LStB scan has its own path; this one is for other
   * forms such as the Swiss Lohnausweis.
   */
  async stageDocumentDrafts(
    userId: string,
    taxYear: number,
    input: {
      readonly screen: Screen
      readonly person: 'A' | 'B'
      readonly digestUserId: string
      readonly receiptId: string | null
      readonly engine: AdvisorEngineInfo
      readonly summaryText: string
      readonly sourceId: OwlSourceId
      readonly fields: ReadonlyArray<{
        readonly field: string
        readonly label: string
        /** A whole amount, or a text such as a date for the fields that take one. */
        readonly value: number | string
        readonly status: 'ok' | 'pruefen'
        readonly reason: LstbExtractedField['reason']
        /** Another mask than `screen` for this field (a child's Anlage Kind beside the parent's mask). */
        readonly screen?: Screen | undefined
        /** The row this field belongs to (a child). */
        readonly instance?: string | undefined
        /** Add to what is recorded or waiting instead of replacing it (a second insurer in the year, ADR-0080). */
        readonly accumulate?: boolean | undefined
        /** What this document counts into the field, so it is not counted again. */
        readonly countedItems?: readonly AdvisorCountedItem[] | undefined
      }>
    },
  ): Promise<{ actions: AdvisorActionProposal[]; assistantMessage: AdvisorChatMessageDto }> {
    for (const item of input.fields) assertAiWritable(item.screen ?? input.screen, item.field)
    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) await this.owlModeService.setSetting(userId, true)

    const digest = await this.buildCaseDigest(input.digestUserId, taxYear)
    // An amount the field already holds from another source is never added to or overwritten silently
    // (ADR-0092 §6, finding N2): the user gets both ways as alternatives, „zusätzlich“ or „ersetzen“.
    const rawActions: AdvisorActionProposal[] = []
    for (const item of input.fields) {
      const screen = item.screen ?? input.screen
      const incoming = String(item.value)
      const draft = (value: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => {
        const sim = simulateAdvisorFieldDelta(digest, screen, item.field, value)
        return {
          actionId: newActionId(),
          status: 'pending',
          screen,
          field: item.field,
          instance: item.instance ?? null,
          label: item.label,
          previousValue: sim.previousValue,
          expectedPreviousValue: sim.previousValue,
          newValue: value,
          beforeRefundEur: sim.beforeRefundEur,
          afterRefundEur: sim.afterRefundEur,
          deltaEur: sim.deltaEur,
          reason: 'Vom Beleg gelesen',
          ...(item.countedItems ? { countedItems: item.countedItems } : {}),
          sourceId: input.sourceId,
          paragraph: ADVISOR_LEGAL_SOURCES[input.sourceId].paragraph,
          ...(input.receiptId ? { receiptId: input.receiptId } : {}),
          ...(input.person === 'B' ? { person: 'B' as const } : {}),
          confidenceStatus: item.status,
          fieldReason: item.reason,
          ...extra,
        }
      }
      const target = { screen, field: item.field, person: input.person, instance: item.instance ?? null }
      const existing = typeof item.value === 'number' ? await this.existingAmount(userId, taxYear, input.digestUserId, target, input.receiptId) : null
      // A sum of several documents (the self-borne medical costs) adds another one up; a single value asks (§6).
      const how =
        existing === null
          ? 'write'
          : ACCUMULATING_KEYS.has(`${screen}.${item.field}`)
            ? sumFieldCombination(existing.value, incoming, existing.source, false)
            : amountCombination(existing.value, incoming, existing.source)
      if (how === 'write') {
        rawActions.push(draft(incoming))
        continue
      }
      if (how === 'add') {
        const sum = addAmounts(existing!.value!, incoming)
        rawActions.push(draft(sum, { reason: `Vom Beleg gelesen: bisher ${existing!.value}, dazu ${incoming}.`, ...(item.countedItems ? { countedItems: [...existing!.counted, ...item.countedItems] } : {}) }))
        continue
      }
      rawActions.push(...combinationDrafts(draft, item.label, existing!, incoming, item.countedItems))
    }
    const initialMeta: AdvisorMessageMeta = { sources: [input.sourceId], actions: rawActions }
    const enrichedMeta = await this.drafts.enrichDraftsWithRawBaseline(userId, taxYear, initialMeta)
    checkPiiFree(enrichedMeta)
    await this.drafts.supersedePendingDraftsForSameTargets(userId, taxYear, this.drafts.collectPendingTargetKeys(enrichedMeta))
    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })
    return { actions: (enrichedMeta.actions ?? []).map((a) => toPublicAction(a)), assistantMessage: toMessageDto(assistantMessage) }
  }

  /**
   * What receipts already counted into a field that adds up (donations, a health insurer's premiums):
   * in applied drafts and in the draft still waiting (ADR-0080).
   */
  async countedReceiptItems(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorCountedItem[]> {
    const items: AdvisorCountedItem[] = []
    for (const action of await this.draftsFor(userId, taxYear, target)) if (action.status === 'applied') items.push(...(action.countedItems ?? []))
    return [...items, ...((await this.pendingDraftFor(userId, taxYear, target))?.countedItems ?? [])]
  }

  /**
   * What a document's amount meets in its field (ADR-0092 §6): the draft still waiting for it, or else
   * the value recorded, and whether that came from this very document, another one, or by hand / the chat.
   */
  private async existingAmount(
    userId: string,
    taxYear: number,
    dataUserId: string,
    target: CountTarget,
    receiptId: string | null,
  ): Promise<ExistingAmount> {
    const drafts = await this.draftsFor(userId, taxYear, target)
    // The receipts already in this field (applied or waiting): another one of them again is a copy or a correction.
    const marks = drafts.filter((a) => a.status === 'applied' || a.status === 'pending').flatMap((a) => (a.receiptMark ? [a.receiptMark] : []))
    const pending = drafts.filter((a) => a.status === 'pending' && a.combination !== 'replace').at(-1)
    if (pending !== undefined) {
      const own = receiptId !== null && pending.receiptId === receiptId
      return { value: pending.newValue, source: own ? 'thisDocument' : 'other', fromDocument: pending.receiptId !== undefined, counted: pending.countedItems ?? [], marks, companions: pending.companionFields ?? {} }
    }
    const key = provenanceKey(target.screen, target.field, target.instance ?? undefined)
    const stored = await this.confirmationService.valueWithSource(dataUserId, taxYear, key).catch(() => ({ value: null, receiptId: null }))
    if (stored.value === null) return { value: null, source: 'none', fromDocument: false, counted: [], marks }
    const own = receiptId !== null && stored.receiptId === receiptId
    return { value: stored.value, source: own ? 'thisDocument' : 'other', fromDocument: stored.receiptId !== null, counted: [], marks }
  }

  private async pendingCountedItems(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorCountedItem[]> {
    return [...((await this.pendingDraftFor(userId, taxYear, target))?.countedItems ?? [])]
  }

  private async draftsFor(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorActionProposal[]> {
    return (await this.advisorRepo.listForUserAndYear(userId, taxYear))
      .flatMap((m) => [...(m.meta?.action ? [m.meta.action] : []), ...(m.meta?.actions ?? [])])
      .filter(
        (a) =>
          a.screen === target.screen &&
          a.field === target.field &&
          (a.person ?? 'A') === (target.person ?? 'A') &&
          (a.instance ?? null) === (target.instance ?? null),
      )
  }

  private async pendingDraftFor(userId: string, taxYear: number, target: CountTarget): Promise<AdvisorActionProposal | undefined> {
    // Of the two ways „zusätzlich“ / „ersetzen“ still open, the one adding up carries everything counted.
    return (await this.draftsFor(userId, taxYear, target)).filter((a) => a.status === 'pending' && a.combination !== 'replace').at(-1)
  }

  /**
   * The child a receipt is about: the only child of the year, or among several the one the document names
   * (ADR-0086). Null when it stays unclear; `children` says how many there are, for the question to the user.
   */
  async childForReceipt(userId: string, taxYear: number, text: string): Promise<{ id: string | null; children: number }> {
    const children = (await this.childRepo?.listForUserAndYear(userId, taxYear)) ?? []
    return { id: children.length === 0 ? null : childNamedIn(text, children), children: children.length }
  }

  /** Values of receipt drafts still waiting on this screen (newest first wins), for the fields that add up. */
  private async pendingReceiptValues(userId: string, taxYear: number, screen: Screen): Promise<Map<string, string>> {
    const values = new Map<string, string>()
    // Oldest to newest, so a newer draft overwrites an older one.
    for (const message of await this.advisorRepo.listForUserAndYear(userId, taxYear)) {
      // A single receipt's draft, and the drafts a document staged together (a health insurer's
      // statement puts the self-borne costs next to the premiums): a later receipt adds to either.
      const actions = [...(message.meta?.action ? [message.meta.action] : []), ...(message.meta?.actions ?? [])]
      for (const action of actions) {
        if (action.status !== 'pending' || action.screen !== screen || action.person === 'B' || (action.instance ?? null) !== null) continue
        values.set(action.field, action.newValue)
        for (const [field, value] of Object.entries(action.companionFields ?? {})) values.set(field, value)
      }
    }
    return values
  }

  /**
   * Takes back what one document put into the return (ADR-0092 §4), before it is assigned to someone else:
   * each applied draft from it is undone where the field still holds what the draft wrote — a value
   * changed since by hand or by another source stays — and its drafts still waiting are dismissed.
   * Returns how many applied drafts were taken back.
   */
  async takeBackDocumentValues(userId: string, taxYear: number, receiptId: string): Promise<number> {
    return this.transactions.run(async () => {
      let takenBack = 0
      const undoneAt = new Date().toISOString()
      for (const message of await this.advisorRepo.listForUserAndYear(userId, taxYear)) {
        const meta = message.meta
        if (!meta) continue
        let changed = false
        const takeBack = async (action: AdvisorActionProposal): Promise<AdvisorActionProposal> => {
          if (action.receiptId !== receiptId) return action
          if (action.status === 'pending') {
            changed = true
            return { ...action, status: 'dismissed' }
          }
          if (action.status !== 'applied') return action
          const dataUserId = await this.drafts.dataUserFor(userId, taxYear, action)
          const key = provenanceKey(action.screen, action.field, action.instance ?? undefined)
          const snapshot = action.undoSnapshot ?? [{ key, previousValue: null, appliedValue: action.newValue, previousMarking: null }]
          // Main field first, companions after — the reverse of the apply order.
          for (let i = snapshot.length - 1; i >= 0; i -= 1) {
            const entry = snapshot[i]!
            const current = await this.confirmationService.readRawValue(dataUserId, taxYear, entry.key).catch(() => undefined)
            // The user's own click in the app, not the owl: personal fields may be restored too.
            if (current === entry.appliedValue) await this.confirmationService.restoreByAdvisor(dataUserId, taxYear, entry, { personalDataConsent: true })
          }
          takenBack++
          changed = true
          const { undoSnapshot: _consumed, ...rest } = action
          return { ...rest, status: 'undone', undoneAt }
        }
        const actions: AdvisorActionProposal[] = []
        for (const action of meta.actions ?? []) actions.push(await takeBack(action))
        const next: AdvisorMessageMeta = {
          ...meta,
          ...(meta.action ? { action: await takeBack(meta.action) } : {}),
          ...(meta.actions ? { actions } : {}),
        }
        if (changed) await this.advisorRepo.updateMessageMeta(message.id, userId, next)
      }
      if (takenBack > 0) await this.auditService.append({ userId, action: 'WRITE', resource: 'beleg_zuordnung' })
      return takenBack
    })
  }

  async markLstbActionsApplied(userId: string, taxYear: number, actionIds: readonly string[]): Promise<void> {
    if (actionIds.length === 0) return
    const targetIds = new Set(actionIds)
    const history = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    const appliedAt = new Date().toISOString()

    for (const msg of history) {
      if (!msg.meta?.actions) continue
      let changed = false
      const hits = msg.meta.actions.some((a) => targetIds.has(a.actionId))
      const nextActions = msg.meta.actions.map((a) => {
        if (targetIds.has(a.actionId) && a.status === 'pending') {
          changed = true
          return { ...a, status: 'applied' as const, appliedAt }
        }
        // The mask took the scan over its own way: the chat's „zusätzlich“ alternative is answered too.
        if (hits && a.status === 'pending' && a.combination !== undefined) {
          changed = true
          return { ...a, status: 'superseded' as const }
        }
        return a
      })
      if (changed) {
        await this.advisorRepo.updateMessageMeta(msg.id, userId, { ...msg.meta, actions: nextActions })
      }
    }
  }

}

/**
 * The model's drafts without the ones that would change a recorded value the user did not ask about, or
 * write the value already there; the answer then says what was left as it was (ADR-0082).
 */
function guardModelDrafts(meta: AdvisorMessageMeta, userText: string): { meta: AdvisorMessageMeta; note: string } {
  const drafts = [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]
  if (drafts.length === 0) return { meta, note: '' }
  const { kept, held } = holdUnaskedOverwrites(drafts.map((d) => (d.person === 'B' ? { ...d, label: `${d.label} (Person B)` } : d)), userText)
  const keep = new Set(kept.map((d) => d.actionId))
  const { action, actions, ...rest } = meta
  return {
    meta: {
      ...rest,
      ...(action && keep.has(action.actionId) ? { action } : {}),
      ...(actions ? { actions: actions.filter((a) => keep.has(a.actionId)) } : {}),
    },
    note: heldDraftsNote(held),
  }
}

/** What a document's amount meets in its field. */
interface ExistingAmount {
  readonly value: string | null
  readonly source: ExistingValueSource
  /** The value came from a document (not typed by hand or told in the chat). */
  readonly fromDocument: boolean
  /** What the waiting draft already counted (a statement, a donation), carried on when adding. */
  readonly counted: readonly AdvisorCountedItem[]
  /** The receipts already in a sum field, to tell the same receipt again from another one. */
  readonly marks: readonly ReceiptMark[]
  /** The companion values of the draft still waiting (a craftsman's invoice total), which add up too. */
  readonly companions?: Readonly<Record<string, string>> | undefined
}

/**
 * The two ways to take a document's amount into a field that already holds one (ADR-0092 §6): on top of
 * it (a second employer, a second insurer) or instead of it (a correction). Alternatives of one group.
 */
export function combinationDrafts(
  draft: (value: string, extra?: Partial<AdvisorActionProposal>) => AdvisorActionProposal,
  label: string,
  existing: ExistingAmount,
  incoming: string,
  counted: readonly AdvisorCountedItem[] | undefined,
): [AdvisorActionProposal, AdvisorActionProposal] {
  const before = existing.value ?? '0'
  const sum = addAmounts(before, incoming)
  const said = existing.fromDocument ? 'aus einem anderen Beleg' : 'von Hand oder im Chat eingetragen'
  const add = draft(sum, {
    label: `${label} – zusätzlich`,
    reason: `Schon eingetragen: ${before} (${said}). Dieser Beleg: ${incoming}. Zusätzlich, etwa für einen zweiten Arbeitgeber oder eine zweite Kasse: zusammen ${sum}.`,
    combination: 'add',
    ...(counted ? { countedItems: [...existing.counted, ...counted] } : {}),
  })
  const replace = draft(incoming, {
    label: `${label} – ersetzen (Korrektur)`,
    reason: `Schon eingetragen: ${before} (${said}). Ersetzen, wenn dieser Beleg den bisherigen Wert korrigiert: dann ${incoming}.`,
    combination: 'replace',
    alternativeGroup: `combine:${add.actionId}`,
  })
  return [{ ...add, alternativeGroup: `combine:${add.actionId}` }, replace]
}
