import { randomUUID } from 'node:crypto'
import { newActionId } from '../common/action-id.js'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  ADVISOR_LEGAL_SOURCES,
  PROFESSION_VALUES,
  amountFromAnswer,
  buildAdvisorHistory,
  evaluateAdvisorTurn,
  homeOfficeDaysFromInterview,
  provenanceKey,
  scrubUserMessagePii,
  simulateAdvisorFieldDelta,
  buildRecordHandles,
  type AdvisorActionProposal,
  type AdvisorEngineInfo,
  type AdvisorEnginePort,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorHistoryEntry,
  type AdvisorMessageFeedback,
  type AdvisorMessageMeta,
  type AdvisorPreviewEffect,
  type AdvisorPreviewTarget,
  type AdvisorRecordHandles,
  type AdvisorStreamEvent,
  type AdvisorTurnResult,
  type AdvisorTurnUsage,
  type AdvisorUndoEntry,
  type CaseDigest,
  type LstbCalculationTerm,
  type LstbExtractedField,
  type OwlSourceId,
  type Profession,
  type Screen,
  type WageTaxCertificateFieldId,
  advisorContextUsage,
  fallbackSummary,
  summaryCut,
  transcriptForSummary,
  type AdvisorHistorySource,
  ADVISOR_NOTES_MAX,
  buildNoteHandles,
  tidyNoteText,
  type AdvisorNoteChange,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { ADVISOR_ENGINE } from '../ki/langgraph-advisor.engine.js'
import {
  AI_RUNTIME_CONFIG_SERVICE,
  DEFAULT_AI_TURN_LIMITS,
  type AiRuntimeConfigService,
} from '../ki/ai-runtime-config.service.js'
import { TaxEstimateService, type TaxEstimateStatus } from '../tax-estimate/tax-estimate.service.js'
import { TRANSACTION_RUNNER, passThroughTransactionRunner, type TransactionRunner } from '../prisma/transaction.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  type CrossBorderSalaryStatementRepository,
} from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { assertAiWritable } from '../confirmation/ai-write-policy.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { ConflictError, DomainError, InvalidInputError, NotFoundError, TooManyRequestsError, UnavailableError } from '../common/domain-error.js'
import {
  ADVISOR_REPOSITORY,
  type AdvisorChatMessageRecord,
  type AdvisorConversationRecord,
  type AdvisorMessageUsage,
  type AdvisorNoteRecord,
  type AdvisorRepository,
  type FinishAdvisorMessageInput,
} from './advisor.repository.js'
import type {
  AdvisorActionMutationResponseDto,
  AdvisorChatMessageDto,
  AdvisorContextDto,
  AdvisorConversationDto,
  AdvisorNoteDto,
  AdvisorSessionResponseDto,
  ApplyBatchActionsDto,
  ApplyBatchActionsResponseDto,
  SendAdvisorMessageDto,
  SendAdvisorMessageResponseDto,
} from './dto/advisor.dto.js'

const DETERMINISTIC_ENGINE: AdvisorEngineInfo = { mode: 'deterministic_fallback', provider: 'deterministic' }

interface ResolvedDraft {
  readonly messageRecord: AdvisorChatMessageRecord
  readonly action: AdvisorActionProposal
  readonly key: string
}

function parseNum(raw: string | null | undefined): number | null {
  if (!raw || raw === 'unklar') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

/** Strips the server-internal undo snapshot; the client never needs prior provenance rows. */
function toPublicAction<T extends AdvisorActionProposal>(action: T): T {
  if (action.undoSnapshot === undefined) return action
  const { undoSnapshot: _internal, ...rest } = action
  return rest as T
}

function toPublicMeta(meta: AdvisorMessageMeta): AdvisorMessageMeta {
  const { engine: _internal, ...rest } = meta
  return {
    ...rest,
    ...(rest.action ? { action: toPublicAction(rest.action) } : {}),
    ...(rest.actions ? { actions: rest.actions.map((a) => toPublicAction(a)) } : {}),
    ...(rest.twoPaths
      ? {
          twoPaths: {
            ...rest.twoPaths,
            safePath: toPublicAction(rest.twoPaths.safePath),
            maxPath: toPublicAction(rest.twoPaths.maxPath),
          },
        }
      : {}),
  }
}

function toMessageDto(record: AdvisorChatMessageRecord): AdvisorChatMessageDto {
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    meta: record.meta ? toPublicMeta(record.meta) : null,
    createdAt: record.createdAt.toISOString(),
    status: record.status,
    ...(record.reasoning !== null ? { reasoning: record.reasoning } : {}),
    feedback: record.feedback,
    ...(record.runId !== null ? { runId: record.runId } : {}),
  }
}

const TURN_FAILED_MESSAGE = 'Die Antwort der Eule ist unterwegs abgebrochen. Bitte versuche es erneut.'

/** A turn after its checks: both messages exist, the model has not been called yet. */
export interface PreparedAdvisorTurn {
  readonly runId: string
  readonly userMessage: AdvisorChatMessageRecord
  readonly assistantMessageId: string
  readonly scrubbedUserText: string
  readonly history: readonly AdvisorHistoryEntry[]
  readonly dto: SendAdvisorMessageDto
  readonly conversationId: string
  /** The context of the conversation is full: its older part is summarised before the model is asked. */
  readonly needsSummary: boolean
}

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

/** More conversations in one year than anyone can keep apart are a list nobody reads. */
export const MAX_CONVERSATIONS_PER_YEAR = 50
const TITLE_MAX_LENGTH = 60

/** A conversation title from free text: one line, cut at a word where possible. */
export function titleFrom(text: string): string | null {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine === '') return null
  if (oneLine.length <= TITLE_MAX_LENGTH) return oneLine
  const cut = oneLine.slice(0, TITLE_MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > TITLE_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** The messages the model still reads verbatim: everything after the summarised part. */
function liveMessages(conversation: AdvisorConversationRecord, records: readonly AdvisorChatMessageRecord[]): AdvisorChatMessageRecord[] {
  const until = conversation.summaryUntil
  return until === null ? [...records] : records.filter((record) => record.createdAt.getTime() > until.getTime())
}

function historySources(records: readonly AdvisorChatMessageRecord[], knownNames: readonly string[]): AdvisorHistorySource[] {
  return records.map((msg) => ({ role: msg.role, content: scrubUserMessagePii(msg.content, [...knownNames]), meta: msg.meta, status: msg.status }))
}

function contextOf(conversation: AdvisorConversationRecord, records: readonly AdvisorChatMessageRecord[], knownNames: readonly string[]): AdvisorContextDto {
  const live = liveMessages(conversation, records)
  const sources = historySources(live, knownNames)
  const covered = records.filter((record) => !live.includes(record))
  return {
    ...advisorContextUsage(sources, conversation.summary),
    ...(conversation.summary ? { summary: conversation.summary } : {}),
    ...(covered.length > 0 ? { summarizedUntilMessageId: covered[covered.length - 1]!.id } : {}),
    canSummarize: summaryCut(sources) > 0,
  }
}

function toNoteDto(note: AdvisorNoteRecord): AdvisorNoteDto {
  return { id: note.id, text: note.text, author: note.author, updatedAt: note.updatedAt.toISOString() }
}

function toConversationDto(conversation: AdvisorConversationRecord): AdvisorConversationDto {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    lastUsedAt: conversation.lastUsedAt.toISOString(),
  }
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
  ) {}

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
      let states: { before: TaxEstimateStatus; after: TaxEstimateStatus } | null = null
      try {
        await this.transactions.run(async () => {
          const before = await estimate.getState(userId, taxYear)
          for (const [field, value] of target.values) {
            await this.confirmationService.writeConfirmedByAdvisor(userId, taxYear, provenanceKey(target.screen, field, target.instance ?? undefined), value)
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

  /** Names of the user and their children, so free text can be scrubbed before it reaches any model. */
  async knownNamesForScrubbing(userId: string, taxYear: number): Promise<string[]> {
    const names: string[] = []
    if (this.profileRepo) {
      const profile = await this.profileRepo.findByUserId(userId)
      if (profile?.firstName) names.push(profile.firstName)
      if (profile?.lastName) names.push(profile.lastName)
    }
    if (this.childRepo) {
      const children = await this.childRepo.listForUserAndYear(userId, taxYear)
      for (const child of children) {
        if (child.firstName) names.push(child.firstName)
        if (child.lastName) names.push(child.lastName)
      }
    }
    return names
  }

  /**
   * The stored rental objects and children under the neutral names the owl uses for them. Only the
   * names go to the model; the ids stay here and are filled into a draft when it is staged.
   */
  async loadRecordHandles(userId: string, taxYear: number): Promise<AdvisorRecordHandles> {
    const [children, rentals] = await Promise.all([
      this.childRepo ? this.childRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
      this.rentalRepo ? this.rentalRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
    ])
    return {
      vermietung: buildRecordHandles('vermietung', rentals.map((rental) => rental.id)),
      kind: buildRecordHandles('kind', children.map((child) => child.id)),
    }
  }

  async buildCaseDigest(userId: string, taxYear: number): Promise<CaseDigest> {
    const [
      currentYearAnswers,
      lastYearAnswers,
      lstbRecord,
      chRecord,
      commuteRecord,
      children,
      rentals,
      capitalRecord,
      owlCardsResponse,
      missingConfirmationsList,
    ] = await Promise.all([
      this.interviewRepo.findAllForUserAndYear(userId, taxYear),
      this.interviewRepo.findAllForUserAndYear(userId, taxYear - 1),
      this.lstbRepo ? this.lstbRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.chRepo ? this.chRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.commuteRepo ? this.commuteRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.childRepo ? this.childRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
      this.rentalRepo ? this.rentalRepo.listForUserAndYear(userId, taxYear) : Promise.resolve([]),
      this.capitalRepo ? this.capitalRepo.findForUserAndYear(userId, taxYear) : Promise.resolve(null),
      this.owlModeService.getCards(userId, taxYear),
      this.confirmationService.missing(userId, taxYear),
    ])

    const answerMap: Record<string, string> = {}
    for (const row of currentYearAnswers) {
      answerMap[row.questionId] = row.value
    }

    const lastYearMap: Record<string, string> = {}
    for (const row of lastYearAnswers) {
      lastYearMap[row.questionId] = row.value
    }

    const rawProfession = answerMap['beruf']
    const profession = (PROFESSION_VALUES as readonly string[]).includes(rawProfession ?? '')
      ? (rawProfession as Profession)
      : undefined

    const homeOfficeDays =
      commuteRecord && commuteRecord.homeOfficeDays > 0
        ? commuteRecord.homeOfficeDays
        : homeOfficeDaysFromInterview(answerMap)

    const digest: CaseDigest = {
      taxYear,
      filingStatus: answerMap['partner'] === 'Ja' ? 'zusammen' : 'einzel',
      profession,
      lstbPersonA: {
        grossWageEur: parseNum(lstbRecord?.bruttoarbeitslohn),
        wageTaxEur: parseNum(lstbRecord?.lohnsteuer),
        socialSecurityEur: parseNum(lstbRecord?.sozialversicherung),
      },
      crossBorder: {
        isCrossBorderCh: answerMap['ausland'] === 'Ja, in die Schweiz',
        grossWageChf: parseNum(chRecord?.fields['bruttolohn-total']),
        withholdingTaxChf: parseNum(chRecord?.fields['quellensteuer']),
        pillar3aChf: parseNum(chRecord?.saeule3aChf),
        healthInsuranceChf: parseNum(chRecord?.krankenkasseChf),
        dailySicknessBenefitChf: parseNum(chRecord?.nGre?.krankentaggeldChf),
        nonReturnDays: parseNum(answerMap['ch-nichtrueckkehrtage']),
      },
      commuteAndWorkdays: {
        workdays: parseNum(answerMap['tage']) ?? 220,
        homeOfficeAnswer: answerMap['homeoffice'] ?? null,
        homeOfficeDays,
        distanceKm: commuteRecord?.oneWayKm ?? parseNum(answerMap['weg']),
      },
      catalogExpenses: {
        hasTraining: answerMap['fortbildung'] === 'Ja' || answerMap['katalog_fortbildung'] === 'ja',
        trainingCostsEur: answerMap['fortbildung'] === 'Ja' ? amountFromAnswer(answerMap['fortbildung-kosten']) : null,
        relocationCostsEur: answerMap['umzug'] === 'Ja' ? amountFromAnswer(answerMap['umzug-kosten']) : null,
        donationsEur:
          answerMap['spenden'] === 'Ja'
            ? amountFromAnswer(answerMap['spenden-betrag'])
            : amountFromAnswer(answerMap['katalog_spenden']),
        selfPaidKvPvEur: answerMap['kv-pv'] === 'Ja' ? amountFromAnswer(answerMap['kv-pv-betrag']) : null,
        riesterEur: answerMap['riester'] === 'Ja' ? amountFromAnswer(answerMap['riester-betrag']) : null,
        doubleHouseholdRentEur: answerMap['dhf'] === 'Ja' ? amountFromAnswer(answerMap['dhf-miete']) : null,
      },
      childrenCount: children.length,
      rentalObjectsCount: rentals.length,
      capitalGainEur: parseNum(capitalRecord?.kapitalertraege),
      priorYearComparison: {
        donationsEur: amountFromAnswer(lastYearMap['spenden-betrag']) ?? amountFromAnswer(lastYearMap['katalog_spenden']),
      },
      openOwlHints: owlCardsResponse.cards.map((c) => ({
        id: c.id,
        fingerprint: c.fingerprint,
        title: c.title,
        message: c.message,
        sourceId: 'estg-9-1',
        amountEur: c.amountEur,
      })),
      printoutMissingFields: missingConfirmationsList,
      estimatedRefundEur: null,
    }

    // Security gate: verify CaseDigest is 100% free of Steuer-IDs, IBANs, and personal keys
    checkPiiFree(digest)

    return digest
  }

  /**
   * The conversation a request is about (#481). Without an id it is the one used last in that
   * year, created when the year has none: the project of a tax return exists as soon as it is opened.
   */
  async conversationFor(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorConversationRecord> {
    if (conversationId === undefined) return this.advisorRepo.defaultConversation(userId, taxYear)
    const conversation = await this.advisorRepo.findConversation(conversationId, userId)
    if (!conversation || conversation.taxYear !== taxYear) {
      throw new NotFoundError('ADVISOR_CONVERSATION_NOT_FOUND', 'Dieses Gespräch gibt es nicht (mehr).')
    }
    return conversation
  }

  async listConversations(userId: string, taxYear: number): Promise<AdvisorConversationDto[]> {
    await this.advisorRepo.defaultConversation(userId, taxYear)
    return (await this.advisorRepo.listConversations(userId, taxYear)).map(toConversationDto)
  }

  async createConversation(userId: string, taxYear: number): Promise<AdvisorConversationDto> {
    const existing = await this.advisorRepo.listConversations(userId, taxYear)
    // A conversation nobody has written in yet is the new one: no pile of empty conversations.
    for (const conversation of existing) {
      if ((await this.advisorRepo.listForConversation(conversation.id, userId)).length === 0) {
        const reused = await this.advisorRepo.updateConversation(conversation.id, userId, { lastUsedAt: new Date() })
        return toConversationDto(reused ?? conversation)
      }
    }
    if (existing.length >= MAX_CONVERSATIONS_PER_YEAR) {
      throw new ConflictError(
        'ADVISOR_CONVERSATION_LIMIT',
        `In einem Steuerjahr sind höchstens ${MAX_CONVERSATIONS_PER_YEAR} Gespräche möglich. Lösche eines, das du nicht mehr brauchst.`,
      )
    }
    return toConversationDto(await this.advisorRepo.createConversation(userId, taxYear))
  }

  async renameConversation(userId: string, taxYear: number, conversationId: string, title: string): Promise<AdvisorConversationDto> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const updated = await this.advisorRepo.updateConversation(conversation.id, userId, { title: titleFrom(scrubUserMessagePii(title, knownNames)) })
    return toConversationDto(updated ?? conversation)
  }

  /**
   * Deletes a conversation with its messages. Values already applied to the return stay; drafts
   * that were still open in it disappear.
   */
  async deleteConversation(userId: string, taxYear: number, conversationId: string): Promise<{ deletedMessages: number }> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const deletedMessages = (await this.advisorRepo.deleteConversation(conversation.id, userId)) ?? 0
    await this.auditService.append({ userId, action: 'WRITE', resource: 'berater_gespraech_geloescht' })
    return { deletedMessages }
  }

  /**
   * Condenses the older part of a conversation into its summary (#481) and returns the conversation
   * as it stands afterwards. The newest turns stay verbatim; without a model the summary lists the
   * questions and what became of the proposals, so a full conversation never blocks.
   */
  private async compact(userId: string, taxYear: number, conversation: AdvisorConversationRecord, exceptIds: readonly string[], signal?: AbortSignal): Promise<AdvisorConversationRecord> {
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const live = liveMessages(conversation, await this.advisorRepo.listForConversation(conversation.id, userId)).filter((m) => !exceptIds.includes(m.id))
    const sources = historySources(live, knownNames)
    const cut = summaryCut(sources)
    if (cut === 0) return conversation
    const older = sources.slice(0, cut)
    const fromModel = this.advisorEngine?.summarize
      ? await this.advisorEngine.summarize({ transcript: transcriptForSummary(older), previousSummary: conversation.summary, signal })
      : null
    const summary = scrubUserMessagePii(fromModel ?? fallbackSummary(older, conversation.summary), knownNames)
    const updated = await this.advisorRepo.updateConversation(conversation.id, userId, { summary, summaryUntil: live[cut - 1]!.createdAt })
    return updated ?? conversation
  }

  /** Summarises before an answer and returns the history the model gets afterwards. */
  private async summarizeForTurn(userId: string, taxYear: number, turn: PreparedAdvisorTurn, signal?: AbortSignal): Promise<readonly AdvisorHistoryEntry[]> {
    const conversation = await this.conversationFor(userId, taxYear, turn.conversationId)
    const thisTurn = [turn.userMessage.id, turn.assistantMessageId]
    const compacted = await this.compact(userId, taxYear, conversation, thisTurn, signal)
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const live = liveMessages(compacted, await this.advisorRepo.listForConversation(compacted.id, userId)).filter((m) => !thisTurn.includes(m.id))
    return buildAdvisorHistory(historySources(live, knownNames), { summary: compacted.summary })
  }

  /** "Jetzt zusammenfassen": the user tidies the context before it is full. */
  async summarizeConversation(userId: string, taxYear: number, conversationId?: string): Promise<AdvisorContextDto> {
    const conversation = await this.conversationFor(userId, taxYear, conversationId)
    const compacted = await this.compact(userId, taxYear, conversation, [])
    if (compacted.summaryUntil?.getTime() === conversation.summaryUntil?.getTime()) {
      throw new ConflictError('ADVISOR_NOTHING_TO_SUMMARIZE', 'Dieses Gespräch ist noch zu kurz, um es zusammenzufassen.')
    }
    await this.auditService.append({ userId, action: 'WRITE', resource: 'berater_gespraech_zusammengefasst' })
    return contextOf(compacted, await this.advisorRepo.listForConversation(compacted.id, userId), await this.knownNamesForScrubbing(userId, taxYear))
  }

  // ── Project notes (#481) ──────────────────────────────────────────────────────────────────

  async listNotes(userId: string, taxYear: number): Promise<AdvisorNoteDto[]> {
    return (await this.advisorRepo.listNotes(userId, taxYear)).map(toNoteDto)
  }

  /** A note text as it may be stored: one line, within the length, without names or identifiers. */
  private async storableNoteText(userId: string, taxYear: number, raw: string): Promise<string> {
    const scrubbed = scrubUserMessagePii(raw, await this.knownNamesForScrubbing(userId, taxYear))
    const text = tidyNoteText(scrubbed)
    if (!text.ok) throw new InvalidInputError('ADVISOR_NOTE_INVALID', text.reason)
    return text.text
  }

  async createNote(userId: string, taxYear: number, raw: string): Promise<AdvisorNoteDto> {
    const text = await this.storableNoteText(userId, taxYear, raw)
    if ((await this.advisorRepo.listNotes(userId, taxYear)).length >= ADVISOR_NOTES_MAX) {
      throw new ConflictError('ADVISOR_NOTE_LIMIT', `Für ein Steuerjahr sind höchstens ${ADVISOR_NOTES_MAX} Notizen möglich. Lösche eine, die nicht mehr gilt.`)
    }
    return toNoteDto(await this.advisorRepo.createNote(userId, taxYear, text, 'user'))
  }

  private async ownNote(userId: string, taxYear: number, noteId: string): Promise<AdvisorNoteRecord> {
    const note = await this.advisorRepo.findNote(noteId, userId)
    if (!note || note.taxYear !== taxYear) throw new NotFoundError('ADVISOR_NOTE_NOT_FOUND', 'Diese Notiz gibt es nicht (mehr).')
    return note
  }

  async updateNote(userId: string, taxYear: number, noteId: string, raw: string): Promise<AdvisorNoteDto> {
    const note = await this.ownNote(userId, taxYear, noteId)
    const updated = await this.advisorRepo.updateNote(note.id, userId, await this.storableNoteText(userId, taxYear, raw), 'user')
    return toNoteDto(updated ?? note)
  }

  async deleteNote(userId: string, taxYear: number, noteId: string): Promise<{ deleted: true }> {
    const note = await this.ownNote(userId, taxYear, noteId)
    await this.advisorRepo.deleteNote(note.id, userId)
    return { deleted: true }
  }

  /**
   * Stores what the owl decided to note, replace or forget in an answer. The owl writes notes on
   * its own; the answer carries every change so the user sees it and can take it back.
   */
  private async applyNoteChanges(userId: string, taxYear: number, changes: readonly AdvisorNoteChange[] | undefined): Promise<AdvisorNoteChange[]> {
    const applied: AdvisorNoteChange[] = []
    for (const change of changes ?? []) {
      if (change.kind === 'added') {
        if ((await this.advisorRepo.listNotes(userId, taxYear)).length >= ADVISOR_NOTES_MAX) continue
        const note = await this.advisorRepo.createNote(userId, taxYear, change.text, 'owl')
        applied.push({ ...change, noteId: note.id })
      } else if (change.noteId !== undefined) {
        const note = await this.advisorRepo.findNote(change.noteId, userId)
        if (!note || note.taxYear !== taxYear) continue
        if (change.kind === 'replaced') {
          await this.advisorRepo.updateNote(note.id, userId, change.text, 'owl')
          applied.push({ ...change, previousText: note.text })
        } else {
          await this.advisorRepo.deleteNote(note.id, userId)
          applied.push({ ...change, text: note.text })
        }
      }
    }
    return applied
  }

  /** "Rückgängig" under an answer: takes back one change the owl made to the notes. */
  async undoNoteChange(userId: string, taxYear: number, messageId: string, index: number): Promise<AdvisorChatMessageDto> {
    const message = await this.advisorRepo.findMessage(messageId, userId)
    const change = message?.taxYear === taxYear ? message.meta?.noteChanges?.[index] : undefined
    if (!message || !change) throw new NotFoundError('ADVISOR_NOTE_CHANGE_NOT_FOUND', 'Diese Änderung gibt es nicht (mehr).')
    if (change.undone) throw new ConflictError('ADVISOR_NOTE_CHANGE_UNDONE', 'Diese Änderung wurde bereits zurückgenommen.')

    let noteId = change.noteId
    if (change.kind === 'added') {
      if (noteId !== undefined) await this.advisorRepo.deleteNote(noteId, userId)
    } else if (change.kind === 'replaced') {
      if (noteId !== undefined && change.previousText !== undefined) await this.advisorRepo.updateNote(noteId, userId, change.previousText, 'owl')
    } else {
      noteId = (await this.advisorRepo.createNote(userId, taxYear, change.text, 'owl')).id
    }
    const noteChanges = message.meta!.noteChanges!.map((entry, i) => (i === index ? { ...entry, noteId, undone: true as const } : entry))
    return toMessageDto(await this.advisorRepo.updateMessageMeta(message.id, userId, { ...message.meta, noteChanges }))
  }

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
      conversations: conversations.map(toConversationDto),
      context: contextOf(conversation, history, await this.knownNamesForScrubbing(userId, taxYear)),
      notes: notes.map(toNoteDto),
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

    // Double PII Shield: scrub known names, Steuer-IDs, IBANs, emails, and phones from user free-text & history
    const knownNames = await this.knownNamesForScrubbing(userId, taxYear)
    const scrubbedUserText = scrubUserMessagePii(dto.message.trim(), knownNames)
    const conversation = await this.conversationFor(userId, taxYear, dto.conversationId)
    if (dto.replaceFromMessageId !== undefined) {
      await this.replaceLatestTurn(userId, conversation.id, dto.replaceFromMessageId)
    }
    // The model sees this conversation only; what the conversations share is the return itself.
    const priorRecords = liveMessages(conversation, await this.advisorRepo.listForConversation(conversation.id, userId))
    const sources = historySources(priorRecords, knownNames)
    // A full context is summarised before the answer, once the stream is open (see executeTurn).
    const needsSummary = advisorContextUsage(sources, conversation.summary).level === 'full'
    await this.advisorRepo.updateConversation(conversation.id, userId, {
      lastUsedAt: new Date(),
      // The first question names the conversation.
      ...(conversation.title === null ? { title: titleFrom(scrubbedUserText) } : {}),
    })
    const history = buildAdvisorHistory(sources, { summary: conversation.summary })

    const runId = randomUUID()
    const userMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      conversationId: conversation.id,
      role: 'user',
      content: scrubbedUserText,
      meta: null,
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

    return { runId, userMessage, assistantMessageId: assistantMessage.id, scrubbedUserText, history, dto, conversationId: conversation.id, needsSummary }
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
    const steps: string[] = []
    let firstTokenMs: number | null = null
    let finished = false

    const finish = async (
      status: FinishAdvisorMessageInput['status'],
      content: string,
      meta: AdvisorMessageMeta,
      usage?: AdvisorTurnUsage,
    ): Promise<AdvisorChatMessageRecord> => {
      finished = true
      const fullMeta: AdvisorMessageMeta = { ...meta, ...(steps.length > 0 ? { steps } : {}) }
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
        const status = 'Die Eule fasst den älteren Verlauf zusammen …'
        steps.push(status)
        yield { event: 'status', data: { text: status } }
        history = await this.summarizeForTurn(userId, taxYear, turn, signal)
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

        const enrichedMeta = await this.enrichDraftsWithRawBaseline(userId, taxYear, fallback.meta)
        await this.supersedePendingDraftsForSameTargets(userId, taxYear, this.collectPendingTargetKeys(enrichedMeta))

        const status = 'Eule prüft deine Akte & Paragraphen …'
        steps.push(status)
        yield { event: 'status', data: { text: status } }
        firstTokenMs = Date.now() - startedAt
        yield { event: 'token', data: { text: fallback.replyText } }
        if (enrichedMeta.choices && enrichedMeta.choices.length > 0) {
          yield { event: 'choices', data: { choices: enrichedMeta.choices } }
        }
        if (enrichedMeta.action) {
          yield { event: 'action', data: toPublicAction(enrichedMeta.action) }
        }
        if (enrichedMeta.twoPaths) {
          yield { event: 'twoPaths', data: toPublicMeta({ twoPaths: enrichedMeta.twoPaths }).twoPaths! }
        }
        const assistant = await finish('complete', fallback.replyText, { ...enrichedMeta, engine: DETERMINISTIC_ENGINE })
        yield doneWith(assistant, 'deterministic_fallback')
        return
      }

      for await (const ev of this.advisorEngine.streamTurn({
        message: scrubbedUserText,
        activeScreen: dto.activeScreen,
        digest,
        history,
        actionIdFactory,
        signal,
        planRequired: dto.quickAction === 'forgotten_check',
        records: await this.loadRecordHandles(userId, taxYear),
        previewEffect: this.previewEffectFor(userId, taxYear),
        notes: buildNoteHandles(await this.advisorRepo.listNotes(userId, taxYear)),
      })) {
        if (ev.event === 'token') {
          firstTokenMs ??= Date.now() - startedAt
          text += ev.data.text
        } else if (ev.event === 'reasoning') {
          reasoning += ev.data.text
        } else if (ev.event === 'status') {
          steps.push(ev.data.text)
        } else if (ev.event === 'tool') {
          steps.push(ev.data.label)
        }

        if (ev.event === 'action') {
          const enriched = await this.enrichSingleDraft(userId, taxYear, ev.data)
          yield { event: 'action', data: toPublicAction(enriched) }
          continue
        }

        if (ev.event === 'twoPaths') {
          const [safePath, maxPath] = await Promise.all([
            this.enrichSingleDraft(userId, taxYear, ev.data.safePath),
            this.enrichSingleDraft(userId, taxYear, ev.data.maxPath),
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
          // Half an answer is kept for the record, but never as if it were complete.
          await finish('failed', text, {})
          yield ev
          return
        }

        if (ev.event === 'done') {
          const turnResult = ev.data as AdvisorTurnResult
          const enrichedMeta = await this.enrichDraftsWithRawBaseline(userId, taxYear, turnResult.meta)
          await this.supersedePendingDraftsForSameTargets(userId, taxYear, this.collectPendingTargetKeys(enrichedMeta))

          const engine: AdvisorEngineInfo = {
            mode: turnResult.mode,
            ...(turnResult.provider !== undefined ? { provider: turnResult.provider } : {}),
            ...(turnResult.model !== undefined ? { model: turnResult.model } : {}),
          }
          if (reasoning.length === 0 && turnResult.reasoning) reasoning = turnResult.reasoning
          const noteChanges = await this.applyNoteChanges(userId, taxYear, enrichedMeta.noteChanges)
          const { noteChanges: _asProposed, ...metaWithoutNotes } = enrichedMeta
          const assistant = await finish(
            'complete',
            turnResult.replyText,
            { ...metaWithoutNotes, ...(noteChanges.length > 0 ? { noteChanges } : {}), engine },
            turnResult.usage,
          )
          yield doneWith(assistant, turnResult.mode)
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
    },
  ): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    assertAiWritable(input.screen, input.field)
    for (const companionField of Object.keys(input.companionFields ?? {})) assertAiWritable(input.screen, companionField)
    checkPiiFree(input)

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const digest = await this.buildCaseDigest(userId, taxYear)
    const sim = simulateAdvisorFieldDelta(digest, input.screen, input.field, input.newValue)

    const draft: AdvisorActionProposal = {
      actionId: newActionId(),
      status: 'pending',
      screen: input.screen,
      field: input.field,
      instance: null,
      ...(input.companionFields ? { companionFields: input.companionFields } : {}),
      label: input.label,
      previousValue: sim.previousValue,
      expectedPreviousValue: sim.previousValue,
      newValue: input.newValue,
      beforeRefundEur: sim.beforeRefundEur,
      afterRefundEur: sim.afterRefundEur,
      deltaEur: sim.deltaEur,
      reason: input.reason,
      sourceId: input.sourceId,
      paragraph: ADVISOR_LEGAL_SOURCES[input.sourceId].paragraph,
      ...(input.receiptId ? { receiptId: input.receiptId } : {}),
    }

    const enrichedMeta = await this.enrichDraftsWithRawBaseline(userId, taxYear, {
      sources: [input.sourceId],
      action: draft,
    })

    await this.supersedePendingDraftsForSameTargets(userId, taxYear, this.collectPendingTargetKeys(enrichedMeta))

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: input.summaryText,
      meta: { ...enrichedMeta, engine: input.engine },
    })

    return {
      action: toPublicAction(enrichedMeta.action!),
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
    const rawActions: AdvisorActionProposal[] = input.fields.map((item) => {
      const valueStr = item.extracted.value !== null ? String(item.extracted.value) : ''
      const sim =
        item.extracted.value !== null
          ? simulateAdvisorFieldDelta(digest, 'lstb', item.field, valueStr)
          : { previousValue: null, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0 }

      return {
        actionId: newActionId(),
        status: 'pending',
        screen: 'lstb',
        field: item.field,
        instance: null,
        label: item.label,
        previousValue: sim.previousValue,
        expectedPreviousValue: sim.previousValue,
        newValue: valueStr,
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
      }
    })

    const initialMeta: AdvisorMessageMeta = {
      sources: ['estg-9-1'],
      actions: rawActions,
      lstbScan: {
        receiptId: input.receiptId,
        stage: input.stage,
        taxYearOnDocument: input.taxYearOnDocument,
        ...(input.person !== undefined ? { person: input.person } : {}),
        actionIds: rawActions.map((a) => a.actionId),
      },
    }

    const enrichedMeta = await this.enrichDraftsWithRawBaseline(userId, taxYear, initialMeta)
    checkPiiFree(enrichedMeta)
    await this.supersedePendingDraftsForSameTargets(userId, taxYear, this.collectPendingTargetKeys(enrichedMeta))

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

  async markLstbActionsApplied(userId: string, taxYear: number, actionIds: readonly string[]): Promise<void> {
    if (actionIds.length === 0) return
    const targetIds = new Set(actionIds)
    const history = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    const appliedAt = new Date().toISOString()

    for (const msg of history) {
      if (!msg.meta?.actions) continue
      let changed = false
      const nextActions = msg.meta.actions.map((a) => {
        if (targetIds.has(a.actionId) && a.status === 'pending') {
          changed = true
          return { ...a, status: 'applied' as const, appliedAt }
        }
        return a
      })
      if (changed) {
        await this.advisorRepo.updateMessageMeta(msg.id, userId, { ...msg.meta, actions: nextActions })
      }
    }
  }

  private targetKeyOf(action: Pick<AdvisorActionProposal, 'screen' | 'field' | 'instance'>): string {
    return provenanceKey(action.screen, action.field, action.instance ?? undefined)
  }

  private collectPendingTargetKeys(meta: AdvisorMessageMeta | null): Set<string> {
    const keys = new Set<string>()
    if (!meta) return keys
    if (meta.action?.status === 'pending') keys.add(this.targetKeyOf(meta.action))
    for (const a of meta.actions ?? []) {
      if (a.status === 'pending') keys.add(this.targetKeyOf(a))
    }
    if (meta.twoPaths?.safePath.status === 'pending') keys.add(this.targetKeyOf(meta.twoPaths.safePath))
    if (meta.twoPaths?.maxPath.status === 'pending') keys.add(this.targetKeyOf(meta.twoPaths.maxPath))
    return keys
  }

  private async enrichSingleDraft(
    userId: string,
    taxYear: number,
    draft: AdvisorActionProposal,
  ): Promise<AdvisorActionProposal> {
    assertAiWritable(draft.screen, draft.field)
    const rawPreviousValue = await this.readBaseline(userId, taxYear, this.targetKeyOf(draft), draft.expectedPreviousValue)
    let companionExpectedValues: Record<string, string | null> | undefined
    if (draft.companionFields) {
      companionExpectedValues = {}
      for (const companionField of Object.keys(draft.companionFields)) {
        assertAiWritable(draft.screen, companionField)
        const companionKey = provenanceKey(draft.screen, companionField, draft.instance ?? undefined)
        companionExpectedValues[companionField] = (await this.readBaseline(userId, taxYear, companionKey, null)) ?? null
      }
    }
    return {
      ...draft,
      expectedPreviousValue: rawPreviousValue ?? null,
      ...(companionExpectedValues ? { companionExpectedValues } : {}),
      paragraph: draft.paragraph ?? ADVISOR_LEGAL_SOURCES[draft.sourceId].paragraph,
    }
  }

  /** A field that does not exist yet (e.g. no commute record) has no baseline; the draft's own one stands. */
  private async readBaseline(
    userId: string,
    taxYear: number,
    key: string,
    fallback: string | null | undefined,
  ): Promise<string | null | undefined> {
    try {
      return await this.confirmationService.readRawValue(userId, taxYear, key)
    } catch (error) {
      if (error instanceof InvalidInputError || error instanceof NotFoundError) return fallback
      throw error
    }
  }

  private async enrichDraftsWithRawBaseline(
    userId: string,
    taxYear: number,
    meta: AdvisorMessageMeta,
  ): Promise<AdvisorMessageMeta> {
    let nextMeta: AdvisorMessageMeta = meta
    if (nextMeta.action) {
      nextMeta = {
        ...nextMeta,
        action: await this.enrichSingleDraft(userId, taxYear, nextMeta.action),
      }
    }
    if (nextMeta.actions) {
      nextMeta = {
        ...nextMeta,
        actions: await Promise.all(nextMeta.actions.map((a) => this.enrichSingleDraft(userId, taxYear, a))),
      }
    }
    if (nextMeta.twoPaths) {
      const [safePath, maxPath] = await Promise.all([
        this.enrichSingleDraft(userId, taxYear, nextMeta.twoPaths.safePath),
        this.enrichSingleDraft(userId, taxYear, nextMeta.twoPaths.maxPath),
      ])
      nextMeta = {
        ...nextMeta,
        twoPaths: {
          ...nextMeta.twoPaths,
          safePath,
          maxPath: {
            ...maxPath,
            evidenceHint: nextMeta.twoPaths.maxPath.evidenceHint,
          },
        },
      }
    }
    return nextMeta
  }

  private async supersedePendingDraftsForSameTargets(
    userId: string,
    taxYear: number,
    targetKeys: Set<string>,
    excludeActionIds: Set<string> = new Set(),
  ): Promise<void> {
    if (targetKeys.size === 0) return
    const history = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    for (const msg of history) {
      if (!msg.meta) continue
      let changed = false
      let updatedMeta = msg.meta

      const maybeSupersede = (proposal: AdvisorActionProposal): AdvisorActionProposal => {
        if (
          proposal.status === 'pending' &&
          !excludeActionIds.has(proposal.actionId) &&
          targetKeys.has(this.targetKeyOf(proposal))
        ) {
          changed = true
          return { ...proposal, status: 'superseded' }
        }
        return proposal
      }

      if (updatedMeta.action) {
        updatedMeta = { ...updatedMeta, action: maybeSupersede(updatedMeta.action) }
      }
      if (updatedMeta.actions) {
        updatedMeta = { ...updatedMeta, actions: updatedMeta.actions.map(maybeSupersede) }
      }
      if (updatedMeta.twoPaths) {
        const nextSafe = maybeSupersede(updatedMeta.twoPaths.safePath)
        const nextMax = maybeSupersede(updatedMeta.twoPaths.maxPath)
        updatedMeta = {
          ...updatedMeta,
          twoPaths: {
            ...updatedMeta.twoPaths,
            safePath: nextSafe,
            maxPath: {
              ...nextMax,
              evidenceHint: updatedMeta.twoPaths.maxPath.evidenceHint,
            },
          },
        }
      }

      if (changed) {
        await this.advisorRepo.updateMessageMeta(msg.id, userId, updatedMeta)
      }
    }
  }

  private findActionInMeta(
    meta: AdvisorMessageMeta | null,
    actionId: string,
  ): AdvisorActionProposal | null {
    if (!meta) return null
    if (meta.action?.actionId === actionId) return meta.action
    const inActions = meta.actions?.find((a) => a.actionId === actionId)
    if (inActions) return inActions
    if (meta.twoPaths?.safePath.actionId === actionId) return meta.twoPaths.safePath
    if (meta.twoPaths?.maxPath.actionId === actionId) return meta.twoPaths.maxPath
    return null
  }

  private replaceActionInMeta(
    meta: AdvisorMessageMeta,
    updatedAction: AdvisorActionProposal,
  ): AdvisorMessageMeta {
    if (meta.action?.actionId === updatedAction.actionId) {
      return { ...meta, action: updatedAction }
    }
    if (meta.actions?.some((a) => a.actionId === updatedAction.actionId)) {
      return {
        ...meta,
        actions: meta.actions.map((a) => (a.actionId === updatedAction.actionId ? updatedAction : a)),
      }
    }
    if (meta.twoPaths) {
      if (meta.twoPaths.safePath.actionId === updatedAction.actionId) {
        return {
          ...meta,
          twoPaths: {
            ...meta.twoPaths,
            safePath: updatedAction,
          },
        }
      }
      if (meta.twoPaths.maxPath.actionId === updatedAction.actionId) {
        return {
          ...meta,
          twoPaths: {
            ...meta.twoPaths,
            maxPath: {
              ...updatedAction,
              evidenceHint: meta.twoPaths.maxPath.evidenceHint,
            },
          },
        }
      }
    }
    return meta
  }

  private assertActionApplicable(action: AdvisorActionProposal): void {
    if (action.status === 'applied') {
      throw new ConflictError('ADVISOR_ACTION_ALREADY_APPLIED', 'Dieser Vorschlag wurde bereits übernommen.')
    }
    if (action.status === 'superseded') {
      throw new ConflictError('ADVISOR_ACTION_SUPERSEDED', 'Dieser Entwurf wurde durch einen neueren Vorschlag ersetzt.')
    }
    if (action.status === 'dismissed') {
      throw new ConflictError('ADVISOR_ACTION_DISMISSED', 'Dieser Entwurf wurde bereits verworfen.')
    }
    assertAiWritable(action.screen, action.field)
    for (const companionField of Object.keys(action.companionFields ?? {})) assertAiWritable(action.screen, companionField)
  }

  private async resolveDraft(userId: string, taxYear: number, actionId: string): Promise<ResolvedDraft> {
    const messageRecord = await this.advisorRepo.findMessageByActionId(userId, taxYear, actionId)
    const action = messageRecord?.meta ? this.findActionInMeta(messageRecord.meta, actionId) : null
    if (!messageRecord || !action) {
      throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${actionId}" wurde nicht gefunden.`)
    }
    return { messageRecord, action, key: this.targetKeyOf(action) }
  }

  /**
   * Every field a draft writes, with the value it must still hold. After a stale conflict the
   * client can re-baseline a field by naming the value it now holds (from the 409 details);
   * the write stays a compare-and-set, so a further change in between still fails.
   */
  private writePlan(
    draft: ResolvedDraft,
    acknowledged: Readonly<Record<string, string | null>> | undefined,
  ): Array<{ key: string; newValue: string; expected: string | null }> {
    const { action, key } = draft
    const baseline = (writeKey: string, own: string | null): string | null =>
      acknowledged !== undefined && Object.hasOwn(acknowledged, writeKey) ? (acknowledged[writeKey] ?? null) : own
    const companions = Object.entries(action.companionFields ?? {}).map(([field, newValue]) => {
      const companionKey = provenanceKey(action.screen, field, action.instance ?? undefined)
      return { key: companionKey, newValue, expected: baseline(companionKey, action.companionExpectedValues?.[field] ?? null) }
    })
    return [
      ...companions,
      {
        key,
        newValue: action.newValue,
        // `previousValue` is display text ("0 €"); it is only a baseline for drafts stored before raw baselines existed.
        expected: baseline(key, action.expectedPreviousValue !== undefined ? action.expectedPreviousValue : action.previousValue),
      },
    ]
  }

  private async collectStaleConflicts(
    userId: string,
    taxYear: number,
    plans: ReadonlyArray<{ actionId: string; writes: ReadonlyArray<{ key: string; expected: string | null }> }>,
  ): Promise<Array<{ actionId: string; key: string; currentValue: string | null }>> {
    const conflicts: Array<{ actionId: string; key: string; currentValue: string | null }> = []
    for (const plan of plans) {
      for (const write of plan.writes) {
        const currentValue = (await this.confirmationService.readRawValue(userId, taxYear, write.key)) ?? null
        if (currentValue !== write.expected) conflicts.push({ actionId: plan.actionId, key: write.key, currentValue })
      }
    }
    return conflicts
  }

  async applyAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    const result = await this.applyBatch(userId, taxYear, { drafts: [{ actionId }] })
    return { message: result.messages[0]!, action: result.actions[0]! }
  }

  /**
   * Applies several drafts as one unit: one transaction, a compare-and-set per field, and
   * every stale field reported at once so the client can show the whole conflict.
   */
  async applyBatch(userId: string, taxYear: number, dto: ApplyBatchActionsDto): Promise<ApplyBatchActionsResponseDto> {
    const actionIds = dto.drafts.map((d) => d.actionId)
    if (new Set(actionIds).size !== actionIds.length) {
      throw new InvalidInputError('ADVISOR_BATCH_DUPLICATE_ACTION', 'Eine Aktion ist doppelt im Batch enthalten.')
    }

    return this.transactions.run(async () => {
      const drafts: ResolvedDraft[] = []
      const targetKeys = new Set<string>()
      for (const item of dto.drafts) {
        const draft = await this.resolveDraft(userId, taxYear, item.actionId)
        this.assertActionApplicable(draft.action)
        if (targetKeys.has(draft.key)) {
          throw new ConflictError('ADVISOR_BATCH_TARGET_CONFLICT', `Mehrere Entwürfe im Batch zielen auf dasselbe Feld "${draft.key}".`)
        }
        targetKeys.add(draft.key)
        drafts.push(draft)
      }

      const plans = drafts.map((draft, i) => ({
        draft,
        actionId: draft.action.actionId,
        writes: this.writePlan(draft, dto.drafts[i]!.acknowledgedCurrentValues),
      }))
      const conflicts = await this.collectStaleConflicts(userId, taxYear, plans)
      if (conflicts.length > 0) {
        const first = conflicts[0]!
        throw new ConflictError(
          'ADVISOR_ACTION_STALE_CONFLICT',
          conflicts.length === 1
            ? `Das Feld "${first.key}" wurde zwischenzeitlich manuell geändert.`
            : `${conflicts.length} Felder wurden zwischenzeitlich manuell geändert.`,
          { conflicts },
        )
      }

      // Recorded on the draft itself, next to field, values, legal source and engine: together with
      // the audit row this answers "which AI suggestion changed which field when" (StBerG), while
      // the audit table keeps carrying no value-bearing column (REQ-004.5).
      const appliedAt = new Date().toISOString()
      const appliedActions: AdvisorActionProposal[] = []
      // The first write to a record that does not exist yet creates it with its defaults (a commute
      // record starts with Mon–Fri), so a sibling field of the same draft no longer holds the value
      // it had when the draft was made. All baselines were checked above, inside this transaction;
      // for a record this batch has already written to, the comparison uses what is there now.
      const writtenRecords = new Set<string>()
      for (const { draft, writes } of plans) {
        const undoSnapshot: AdvisorUndoEntry[] = []
        const provenanceOverride = draft.action.receiptId
          ? ({ kind: 'beleg', receiptId: draft.action.receiptId } as const)
          : undefined
        for (const write of writes) {
          const record = write.key.slice(0, write.key.lastIndexOf('.'))
          const expected = writtenRecords.has(record)
            ? ((await this.confirmationService.readRawValue(userId, taxYear, write.key)) ?? null)
            : write.expected
          undoSnapshot.push(
            await this.confirmationService.writeConfirmedByAdvisor(
              userId,
              taxYear,
              write.key,
              write.newValue,
              expected,
              provenanceOverride,
            ),
          )
          writtenRecords.add(record)
        }
        const { undoneAt: _previousUndo, ...reapplicable } = draft.action
        appliedActions.push({
          ...reapplicable,
          status: 'applied',
          appliedAt,
          previousValue: undoSnapshot[undoSnapshot.length - 1]!.previousValue,
          undoSnapshot,
        })
      }

      // Drafts flip to "applied" only once every field write went through.
      const updatedMessages = new Map<string, AdvisorChatMessageRecord>()
      for (const [i, applied] of appliedActions.entries()) {
        const record = updatedMessages.get(drafts[i]!.messageRecord.id) ?? drafts[i]!.messageRecord
        const persisted = await this.advisorRepo.updateMessageMeta(record.id, userId, this.replaceActionInMeta(record.meta!, applied))
        updatedMessages.set(persisted.id, persisted)
      }

      await this.supersedePendingDraftsForSameTargets(userId, taxYear, targetKeys, new Set(actionIds))
      await this.auditService.append({
        userId,
        action: 'WRITE',
        resource: drafts.length === 1 ? 'berater_aktion' : 'berater_batch_aktion',
        source: 'Assistent: SteuerEule',
      })

      return {
        actions: appliedActions.map(toPublicAction),
        messages: [...updatedMessages.values()].map(toMessageDto),
      }
    })
  }

  async undoAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.transactions.run(async () => {
      const draft = await this.resolveDraft(userId, taxYear, actionId)
      if (draft.action.status !== 'applied') {
        throw new ConflictError('ADVISOR_ACTION_NOT_APPLIED', 'Nur bereits übernommene Vorschläge können rückgängig gemacht werden.')
      }
      // Drafts applied before snapshots existed only remember the main field's previous value.
      const snapshot: readonly AdvisorUndoEntry[] = draft.action.undoSnapshot ?? [
        { key: draft.key, previousValue: draft.action.previousValue, appliedValue: draft.action.newValue, previousMarking: null },
      ]
      // Main field first, companions after — the reverse of the apply order.
      for (let i = snapshot.length - 1; i >= 0; i -= 1) {
        await this.confirmationService.restoreByAdvisor(userId, taxYear, snapshot[i]!)
      }

      const { undoSnapshot: _consumed, ...rest } = draft.action
      const undone: AdvisorActionProposal = { ...rest, status: 'undone', undoneAt: new Date().toISOString() }
      const updatedMessage = await this.advisorRepo.updateMessageMeta(
        draft.messageRecord.id,
        userId,
        this.replaceActionInMeta(draft.messageRecord.meta!, undone),
      )
      await this.auditService.append({
        userId,
        action: 'WRITE',
        resource: 'berater_undo',
        source: 'Assistent: SteuerEule',
      })
      return { message: toMessageDto(updatedMessage), action: undone }
    })
  }

  async dismissAction(userId: string, taxYear: number, actionId: string): Promise<AdvisorActionMutationResponseDto> {
    return this.transactions.run(async () => {
      const draft = await this.resolveDraft(userId, taxYear, actionId)
      this.assertActionApplicable(draft.action)

      let nextMeta = draft.messageRecord.meta!
      if (nextMeta.lstbScan && nextMeta.actions) {
        nextMeta = {
          ...nextMeta,
          actions: nextMeta.actions.map((a) => (a.status === 'pending' ? { ...a, status: 'dismissed' as const } : a)),
        }
      } else {
        nextMeta = this.replaceActionInMeta(nextMeta, { ...draft.action, status: 'dismissed' })
      }

      const updatedMessage = await this.advisorRepo.updateMessageMeta(draft.messageRecord.id, userId, nextMeta)
      const dismissedAction = this.findActionInMeta(updatedMessage.meta, actionId) ?? { ...draft.action, status: 'dismissed' as const }
      return {
        message: toMessageDto(updatedMessage),
        action: toPublicAction(dismissedAction),
      }
    })
  }
}
