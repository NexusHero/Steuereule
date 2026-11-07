import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  ADVISOR_LEGAL_SOURCES,
  PROFESSION_VALUES,
  evaluateAdvisorTurn,
  homeOfficeDaysFromInterview,
  provenanceKey,
  scrubUserMessagePii,
  type AdvisorActionProposal,
  type AdvisorMessageMeta,
  type CaseDigest,
  type Profession,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  type CrossBorderSalaryStatementRepository,
} from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { ConflictError, NotFoundError, TooManyRequestsError } from '../common/domain-error.js'
import {
  ADVISOR_REPOSITORY,
  type AdvisorChatMessageRecord,
  type AdvisorRepository,
} from './advisor.repository.js'
import type {
  AdvisorActionMutationResponseDto,
  AdvisorChatMessageDto,
  AdvisorSessionResponseDto,
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
    // 1. Enforce daily user message quota (50 messages/day)
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

    // 3. Double PII Shield: scrub known names, Steuer-IDs, IBANs, emails, and phones from user free-text
    const knownNames = await this.collectKnownNamesForScrubbing(userId, taxYear)
    const scrubbedUserText = scrubUserMessagePii(dto.message.trim(), knownNames)

    // 4. Persist user message
    const userMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'user',
      content: scrubbedUserText,
      meta: null,
    })

    // 5. Build PII-free CaseDigest & evaluate Zero-Write advisor turn
    const digest = await this.buildCaseDigest(userId, taxYear)
    const turn = evaluateAdvisorTurn({
      message: scrubbedUserText,
      activeScreen: dto.activeScreen,
      digest,
      actionIdFactory: () => `act-${randomUUID().slice(0, 12)}`,
    })

    const assistantMessage = await this.advisorRepo.createMessage({
      userId,
      taxYear,
      role: 'assistant',
      content: turn.replyText,
      meta: turn.meta,
    })

    return {
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
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
    if (targetAction.status === 'applied') {
      throw new ConflictError('ADVISOR_ACTION_ALREADY_APPLIED', 'Dieser Vorschlag wurde bereits übernommen.')
    }

    // Write companion fields first if present (e.g., spenden = 'Ja' when writing spenden-betrag)
    if (targetAction.companionFields) {
      for (const [compField, compVal] of Object.entries(targetAction.companionFields)) {
        const compKey = provenanceKey(targetAction.screen, compField, targetAction.instance ?? undefined)
        await this.confirmationService.writeConfirmedByAdvisor(userId, taxYear, compKey, compVal)
      }
    }

    const key = provenanceKey(targetAction.screen, targetAction.field, targetAction.instance ?? undefined)
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
