import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  ADVISOR_LEGAL_SOURCES,
  PROFESSION_VALUES,
  evaluateAdvisorTurn,
  homeOfficeDaysFromInterview,
  provenanceKey,
  scrubUserMessagePii,
  simulateAdvisorFieldDelta,
  type AdvisorActionProposal,
  type AdvisorEnginePort,
  type AdvisorHistoryEntry,
  type AdvisorMessageMeta,
  type AdvisorStreamEvent,
  type AdvisorTurnResult,
  type CaseDigest,
  type OwlSourceId,
  type Profession,
  type Screen,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { ADVISOR_ENGINE } from '../ki/langgraph-advisor.engine.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  type CrossBorderSalaryStatementRepository,
} from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { ConfirmationService, assertAiWritableScreen } from '../confirmation/confirmation.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { ConflictError, InvalidInputError, NotFoundError, TooManyRequestsError } from '../common/domain-error.js'
import {
  ADVISOR_REPOSITORY,
  type AdvisorChatMessageRecord,
  type AdvisorRepository,
} from './advisor.repository.js'
import type {
  AdvisorActionMutationResponseDto,
  AdvisorChatMessageDto,
  AdvisorSessionResponseDto,
  ApplyBatchActionsDto,
  ApplyBatchActionsResponseDto,
  SendAdvisorMessageDto,
  SendAdvisorMessageResponseDto,
} from './dto/advisor.dto.js'

export const ADVISOR_DAILY_MESSAGE_LIMIT = 50

function parseNum(raw: string | null | undefined): number | null {
  if (!raw || raw === 'unklar') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

function toMessageDto(record: AdvisorChatMessageRecord): AdvisorChatMessageDto {
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    meta: record.meta ?? null,
    createdAt: record.createdAt.toISOString(),
  }
}

@Injectable()
export class AdvisorService {
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
  ) {}

  private async collectKnownNamesForScrubbing(userId: string, taxYear: number): Promise<string[]> {
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
        relocationCostsEur: answerMap['umzug'] === 'Ja' ? parseNum(answerMap['umzug-kosten']) : null,
        donationsEur:
          answerMap['spenden'] === 'Ja'
            ? parseNum(answerMap['spenden-betrag'])
            : parseNum(answerMap['katalog_spenden']),
        selfPaidKvPvEur: answerMap['kv-pv'] === 'Ja' ? parseNum(answerMap['kv-pv-betrag']) : null,
        riesterEur: answerMap['riester'] === 'Ja' ? parseNum(answerMap['riester-betrag']) : null,
        doubleHouseholdRentEur: answerMap['dhf'] === 'Ja' ? parseNum(answerMap['dhf-miete']) : null,
      },
      childrenCount: children.length,
      rentalObjectsCount: rentals.length,
      capitalGainEur: parseNum(capitalRecord?.kapitalertraege),
      priorYearComparison: {
        donationsEur: parseNum(lastYearMap['spenden-betrag']) ?? parseNum(lastYearMap['katalog_spenden']),
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

  async getSession(userId: string, taxYear: number): Promise<AdvisorSessionResponseDto> {
    const [setting, cardsRes, history] = await Promise.all([
      this.owlModeService.getSetting(userId),
      this.owlModeService.getCards(userId, taxYear),
      this.advisorRepo.listForUserAndYear(userId, taxYear),
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
      messages: history.map(toMessageDto),
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
      if (event.event === 'done') {
        finalResponse = event.data as SendAdvisorMessageResponseDto
      }
    }
    if (!finalResponse) {
      throw new InvalidInputError('ADVISOR_EMPTY_TURN', 'Der Berater-Assistent konnte keine Antwort erzeugen.')
    }
    return finalResponse
  }

  async *streamMessage(
    userId: string,
    taxYear: number,
    dto: SendAdvisorMessageDto,
  ): AsyncIterable<AdvisorStreamEvent> {
    // 1. Enforce daily user message quota (50 messages/day) BEFORE opening stream or calling LLM
    const startOfDayUtc = new Date()
    startOfDayUtc.setUTCHours(0, 0, 0, 0)
    const todayCount = await this.advisorRepo.countUserMessagesSince(userId, startOfDayUtc)
    if (todayCount >= ADVISOR_DAILY_MESSAGE_LIMIT) {
      throw new TooManyRequestsError(
        'ADVISOR_DAILY_LIMIT_EXCEEDED',
        `Du hast dein Tageskontingent von ${ADVISOR_DAILY_MESSAGE_LIMIT} Nachrichten an die SteuerEule erreicht. Morgen früh steht dir deine Eule wieder frisch zur Verfügung.`,
      )
    }

    // 2. Ensure Eulen-Modus is enabled when user actively chats with the Eule
    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    // 3. Double PII Shield: scrub known names, Steuer-IDs, IBANs, emails, and phones from user free-text & history
    const knownNames = await this.collectKnownNamesForScrubbing(userId, taxYear)
    const scrubbedUserText = scrubUserMessagePii(dto.message.trim(), knownNames)
    const priorRecords = await this.advisorRepo.listForUserAndYear(userId, taxYear)
    const history: AdvisorHistoryEntry[] = priorRecords.slice(-10).map((msg) => ({
      role: msg.role,
      content: scrubUserMessagePii(msg.content, knownNames),
    }))

    // 4. Persist user message
    const userMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'user',
      content: scrubbedUserText,
      meta: null,
    })

    // 5. Build PII-free CaseDigest & stream Zero-Write advisor turn via LangGraph engine (with deterministic fallback)
    const digest = await this.buildCaseDigest(userId, taxYear)
    const actionIdFactory = () => `act-${randomUUID().slice(0, 12)}`

    if (!this.advisorEngine) {
      const turn = evaluateAdvisorTurn({
        message: scrubbedUserText,
        activeScreen: dto.activeScreen,
        digest,
        actionIdFactory,
      })

      const enrichedMeta = await this.enrichDraftsWithRawBaseline(userId, taxYear, turn.meta)
      await this.supersedePendingDraftsForSameTargets(userId, taxYear, this.collectPendingTargetKeys(enrichedMeta))

      const assistantMessage = await this.advisorRepo.createMessage({
        userId,
        taxYear,
        role: 'assistant',
        content: turn.replyText,
        meta: enrichedMeta,
      })

      const response: SendAdvisorMessageResponseDto = {
        userMessage: toMessageDto(userMessage),
        assistantMessage: toMessageDto(assistantMessage),
      }

      yield { event: 'status', data: { text: 'Eule prüft deine Akte & Paragraphen …' } }
      yield { event: 'token', data: { text: response.assistantMessage.content } }
      if (enrichedMeta.choices && enrichedMeta.choices.length > 0) {
        yield { event: 'choices', data: { choices: enrichedMeta.choices } }
      }
      if (enrichedMeta.action) {
        yield { event: 'action', data: enrichedMeta.action }
      }
      if (enrichedMeta.twoPaths) {
        yield { event: 'twoPaths', data: enrichedMeta.twoPaths }
      }
      yield { event: 'done', data: response }
      return
    }

    for await (const ev of this.advisorEngine.streamTurn({
      message: scrubbedUserText,
      activeScreen: dto.activeScreen,
      digest,
      history,
      actionIdFactory,
    })) {
      if (ev.event === 'action') {
        const enriched = await this.enrichSingleDraft(userId, taxYear, ev.data)
        yield { event: 'action', data: enriched }
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
            safePath,
            maxPath: {
              ...maxPath,
              evidenceHint: ev.data.maxPath.evidenceHint,
            },
          },
        }
        continue
      }

      if (ev.event === 'done') {
        const turnResult = ev.data as AdvisorTurnResult
        const enrichedMeta = await this.enrichDraftsWithRawBaseline(userId, taxYear, turnResult.meta)
        await this.supersedePendingDraftsForSameTargets(userId, taxYear, this.collectPendingTargetKeys(enrichedMeta))

        const assistantMessage = await this.advisorRepo.createMessage({
          userId,
          taxYear,
          role: 'assistant',
          content: turnResult.replyText,
          meta: enrichedMeta,
        })

        const response: SendAdvisorMessageResponseDto = {
          userMessage: toMessageDto(userMessage),
          assistantMessage: toMessageDto(assistantMessage),
        }
        yield { event: 'done', data: response }
        continue
      }

      yield ev
    }
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
    },
  ): Promise<{ action: AdvisorActionProposal; assistantMessage: AdvisorChatMessageDto }> {
    assertAiWritableScreen(input.screen, input.field)
    checkPiiFree(input)

    const setting = await this.owlModeService.getSetting(userId)
    if (!setting.enabled) {
      await this.owlModeService.setSetting(userId, true)
    }

    const digest = await this.buildCaseDigest(userId, taxYear)
    const sim = simulateAdvisorFieldDelta(digest, input.screen, input.field, input.newValue)

    const draft: AdvisorActionProposal = {
      actionId: `act-${randomUUID().slice(0, 12)}`,
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
      meta: enrichedMeta,
    })

    return {
      action: enrichedMeta.action!,
      assistantMessage: toMessageDto(assistantMessage),
    }
  }

  private targetKeyOf(action: Pick<AdvisorActionProposal, 'screen' | 'field' | 'instance'>): string {
    return provenanceKey(action.screen, action.field, action.instance ?? undefined)
  }

  private collectPendingTargetKeys(meta: AdvisorMessageMeta | null): Set<string> {
    const keys = new Set<string>()
    if (!meta) return keys
    if (meta.action?.status === 'pending') keys.add(this.targetKeyOf(meta.action))
    if (meta.twoPaths?.safePath.status === 'pending') keys.add(this.targetKeyOf(meta.twoPaths.safePath))
    if (meta.twoPaths?.maxPath.status === 'pending') keys.add(this.targetKeyOf(meta.twoPaths.maxPath))
    return keys
  }

  private async enrichSingleDraft(
    userId: string,
    taxYear: number,
    draft: AdvisorActionProposal,
  ): Promise<AdvisorActionProposal> {
    assertAiWritableScreen(draft.screen, draft.field)
    const key = this.targetKeyOf(draft)
    let rawPreviousValue = draft.expectedPreviousValue
    try {
      rawPreviousValue = await this.confirmationService.readRawValue(userId, taxYear, key)
    } catch (error) {
      if (!(error instanceof InvalidInputError)) throw error
    }
    return {
      ...draft,
      expectedPreviousValue: rawPreviousValue ?? null,
      paragraph: draft.paragraph ?? ADVISOR_LEGAL_SOURCES[draft.sourceId].paragraph,
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
    assertAiWritableScreen(action.screen, action.field)
  }

  private async assertNotStale(
    userId: string,
    taxYear: number,
    key: string,
    expectedPreviousValue: string | null | undefined,
  ): Promise<void> {
    if (expectedPreviousValue === undefined) return
    const currentValue = await this.confirmationService.readRawValue(userId, taxYear, key)
    if ((currentValue ?? null) !== (expectedPreviousValue ?? null)) {
      throw new ConflictError(
        'ADVISOR_ACTION_STALE_CONFLICT',
        `Das Feld "${key}" wurde zwischenzeitlich manuell geändert.`,
      )
    }
  }

  async applyAction(
    userId: string,
    taxYear: number,
    actionId: string,
  ): Promise<AdvisorActionMutationResponseDto> {
    const messageRecord = await this.advisorRepo.findMessageByActionId(userId, taxYear, actionId)
    if (!messageRecord || !messageRecord.meta) {
      throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${actionId}" wurde nicht gefunden.`)
    }

    const targetAction = this.findActionInMeta(messageRecord.meta, actionId)
    if (!targetAction) {
      throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${actionId}" wurde nicht gefunden.`)
    }
    this.assertActionApplicable(targetAction)

    const key = this.targetKeyOf(targetAction)
    await this.assertNotStale(userId, taxYear, key, targetAction.expectedPreviousValue)

    // Write companion fields first if present (e.g., spenden = 'Ja' when writing spenden-betrag)
    if (targetAction.companionFields) {
      for (const [compField, compVal] of Object.entries(targetAction.companionFields)) {
        const compKey = provenanceKey(targetAction.screen, compField, targetAction.instance ?? undefined)
        await this.confirmationService.writeConfirmedByAdvisor(userId, taxYear, compKey, compVal)
      }
    }

    const { previousValue } = await this.confirmationService.writeConfirmedByAdvisor(
      userId,
      taxYear,
      key,
      targetAction.newValue,
    )

    const updatedAction: AdvisorActionProposal = {
      ...targetAction,
      status: 'applied',
      previousValue,
    }

    const updatedMeta = this.replaceActionInMeta(messageRecord.meta, updatedAction)
    const updatedMessage = await this.advisorRepo.updateMessageMeta(messageRecord.id, userId, updatedMeta)
    await this.supersedePendingDraftsForSameTargets(userId, taxYear, new Set([key]), new Set([actionId]))

    await this.auditService.append({
      userId,
      action: 'WRITE',
      resource: 'berater_aktion',
      source: 'Assistent: SteuerEule',
    })

    return {
      message: toMessageDto(updatedMessage),
      action: updatedAction,
    }
  }

  async applyBatch(
    userId: string,
    taxYear: number,
    dto: ApplyBatchActionsDto,
  ): Promise<ApplyBatchActionsResponseDto> {
    const seenIds = new Set<string>()
    const resolved: Array<{
      messageRecord: AdvisorChatMessageRecord
      targetAction: AdvisorActionProposal
      key: string
    }> = []
    const targetKeys = new Set<string>()

    // Preflight 1: Resolve all actions, check ownership, applicability, Forbidden screens & Stale-Check BEFORE any writes
    for (const item of dto.drafts) {
      if (seenIds.has(item.actionId)) {
        throw new InvalidInputError('ADVISOR_BATCH_DUPLICATE_ACTION', `Aktion "${item.actionId}" ist doppelt im Batch enthalten.`)
      }
      seenIds.add(item.actionId)

      const messageRecord = await this.advisorRepo.findMessageByActionId(userId, taxYear, item.actionId)
      if (!messageRecord || !messageRecord.meta) {
        throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${item.actionId}" wurde nicht gefunden.`)
      }

      const targetAction = this.findActionInMeta(messageRecord.meta, item.actionId)
      if (!targetAction) {
        throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${item.actionId}" wurde nicht gefunden.`)
      }
      this.assertActionApplicable(targetAction)

      const key = this.targetKeyOf(targetAction)
      if (targetKeys.has(key)) {
        throw new ConflictError(
          'ADVISOR_BATCH_TARGET_CONFLICT',
          `Mehrere Entwürfe im Batch zielen auf dasselbe Feld "${key}".`,
        )
      }
      targetKeys.add(key)

      const expectedPreviousValue =
        item.expectedPreviousValue !== undefined ? item.expectedPreviousValue : targetAction.expectedPreviousValue
      await this.assertNotStale(userId, taxYear, key, expectedPreviousValue)

      resolved.push({ messageRecord, targetAction, key })
    }

    // Commit phase with explicit rollback stack so partial failures leave 0 dirty writes
    const writtenBackups: Array<{ key: string; previousValue: string | null }> = []
    const appliedResults: Array<{ messageRecord: AdvisorChatMessageRecord; updatedAction: AdvisorActionProposal }> = []

    try {
      for (const entry of resolved) {
        const { targetAction, key, messageRecord } = entry
        if (targetAction.companionFields) {
          for (const [compField, compVal] of Object.entries(targetAction.companionFields)) {
            const compKey = provenanceKey(targetAction.screen, compField, targetAction.instance ?? undefined)
            const compRes = await this.confirmationService.writeConfirmedByAdvisor(userId, taxYear, compKey, compVal)
            writtenBackups.push({ key: compKey, previousValue: compRes.previousValue })
          }
        }
        const { previousValue } = await this.confirmationService.writeConfirmedByAdvisor(
          userId,
          taxYear,
          key,
          targetAction.newValue,
        )
        writtenBackups.push({ key, previousValue })

        appliedResults.push({
          messageRecord,
          updatedAction: {
            ...targetAction,
            status: 'applied',
            previousValue,
          },
        })
      }
    } catch (error) {
      for (let i = writtenBackups.length - 1; i >= 0; i--) {
        const backup = writtenBackups[i]!
        await this.confirmationService.restoreValueByAdvisor(userId, taxYear, backup.key, backup.previousValue).catch(() => {})
      }
      throw error
    }

    // Group metadata updates per message so messages with multiple applied actions (rare) remain consistent
    const updatedMessagesMap = new Map<string, AdvisorChatMessageRecord>()
    for (const { messageRecord, updatedAction } of appliedResults) {
      const currentRecord = updatedMessagesMap.get(messageRecord.id) ?? messageRecord
      if (!currentRecord.meta) continue
      const nextMeta = this.replaceActionInMeta(currentRecord.meta, updatedAction)
      const persisted = await this.advisorRepo.updateMessageMeta(currentRecord.id, userId, nextMeta)
      updatedMessagesMap.set(persisted.id, persisted)
    }

    await this.supersedePendingDraftsForSameTargets(userId, taxYear, targetKeys, seenIds)

    await this.auditService.append({
      userId,
      action: 'WRITE',
      resource: 'berater_batch_aktion',
      source: 'Assistent: SteuerEule',
    })

    return {
      actions: appliedResults.map((r) => r.updatedAction),
      messages: [...updatedMessagesMap.values()].map(toMessageDto),
    }
  }

  async undoAction(
    userId: string,
    taxYear: number,
    actionId: string,
  ): Promise<AdvisorActionMutationResponseDto> {
    const messageRecord = await this.advisorRepo.findMessageByActionId(userId, taxYear, actionId)
    if (!messageRecord || !messageRecord.meta) {
      throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${actionId}" wurde nicht gefunden.`)
    }

    const targetAction = this.findActionInMeta(messageRecord.meta, actionId)
    if (!targetAction) {
      throw new NotFoundError('ADVISOR_ACTION_NOT_FOUND', `Aktion "${actionId}" wurde nicht gefunden.`)
    }
    if (targetAction.status !== 'applied') {
      throw new ConflictError(
        'ADVISOR_ACTION_NOT_APPLIED',
        'Nur bereits übernommene Vorschläge können rückgängig gemacht werden.',
      )
    }

    const key = provenanceKey(targetAction.screen, targetAction.field, targetAction.instance ?? undefined)
    await this.confirmationService.restoreValueByAdvisor(
      userId,
      taxYear,
      key,
      targetAction.previousValue,
    )
    if (targetAction.previousValue === null && targetAction.companionFields) {
      for (const [compField, compVal] of Object.entries(targetAction.companionFields)) {
        const compKey = provenanceKey(targetAction.screen, compField, targetAction.instance ?? undefined)
        await this.confirmationService.restoreValueByAdvisor(
          userId,
          taxYear,
          compKey,
          compVal === 'Ja' ? 'Nein' : null,
        )
      }
    }

    const updatedAction: AdvisorActionProposal = {
      ...targetAction,
      status: 'undone',
    }

    const updatedMeta = this.replaceActionInMeta(messageRecord.meta, updatedAction)
    const updatedMessage = await this.advisorRepo.updateMessageMeta(messageRecord.id, userId, updatedMeta)

    await this.auditService.append({
      userId,
      action: 'WRITE',
      resource: 'berater_undo',
      source: 'Assistent: SteuerEule',
    })

    return {
      message: toMessageDto(updatedMessage),
      action: updatedAction,
    }
  }
}
