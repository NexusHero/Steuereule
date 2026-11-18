import {
  classifyDocumentKind,
  decideDocumentHolder,
  holderPerson,
  holderScopeOf,
  isHolderRef,
  otherNamedMembers,
  printedPersonNames,
  type AssignmentDecision,
  type AssignmentMember,
  type DetectedDocumentKind,
  type HolderRef,
  type ReceiptReadReason,
  type ReceiptType,
  type Screen,
} from '@steuereule/core'
import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common'
import { AdvisorService } from '../advisor/advisor.service.js'
import { DomainError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  ALLOWED_RECEIPT_PARSE_MIME_TYPES,
  type AssignmentPersonDto,
  type DeviceReadFailure,
  type DocumentAssignmentDto,
  type DocumentKind,
  type ParseReceiptDto,
  type ParseReceiptResponseDto,
} from './dto/parse-receipt.dto.js'
import { AutoReceiptParseStrategy } from './parse/auto-receipt-parse.strategy.js'
import { DocumentParseRegistry } from './parse/document-parse.registry.js'
import { draftsByReceipt, duplicateDto, originalsByContent, processingOf } from './receipt-state.js'
import { RECEIPT_REPOSITORY, type ReceiptRecord, type ReceiptRepository, type RecordReadData } from './receipt.repository.js'
import { STORAGE_PORT, type StoragePort } from './storage/storage.port.js'

/** The reason a Beleg the device could not read is recorded with. */
const DEVICE_FAILURE_REASON: Readonly<Record<DeviceReadFailure, ReceiptReadReason>> = {
  read_failed: 'unlesbar',
  empty_text: 'kein_text',
  unsupported_file: 'nicht_unterstuetzt',
}

/** The document a mask asks for, when the client names no kind (ADR-0097 §4: the entry point only gives context). */
const MASK_EXPECTS: Partial<Record<Screen, DocumentKind>> = { lstb: 'lstb', chLohnausweis: 'chLohnausweis' }

/**
 * Entry point of `POST /v1/belege/parse`, the one ingest use case of every entry point (ADR-0097 §4):
 * validates the payload, checks that a referenced Beleg belongs to the caller, dispatches to the strategy
 * for the document, and writes what the read found out on the Beleg (its read facts and its date), so its
 * processing state can be derived. Zero-Write: strategies only stage advisor proposals, never domain values.
 */
@Injectable()
export class ReceiptParseService implements OnModuleInit {
  constructor(
    @Inject(DocumentParseRegistry) private readonly registry: DocumentParseRegistry,
    @Inject(AutoReceiptParseStrategy) private readonly autoStrategy: AutoReceiptParseStrategy,
    @Inject(RECEIPT_REPOSITORY) private readonly receiptRepository: ReceiptRepository,
    /** The household, to tell whose a document is (ADR-0092). Without it every document is read as before. */
    @Optional() @Inject(AdvisorService) private readonly advisor?: AdvisorService,
    /** The content keys of stored files, to tell a duplicate upload (ADR-0097 §7). Without it none is one. */
    @Optional() @Inject(STORAGE_PORT) private readonly storage?: StoragePort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.autoStrategy)
  }

  async parseReceipt(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    // Without text from the device there is nothing to validate: the failure itself is what is recorded.
    if (dto.deviceReadFailure === undefined) this.assertValidPayload(dto)
    const owned = dto.receiptId ? await this.receiptRepository.findByIdForUser(userId, dto.receiptId) : null
    if (dto.receiptId && owned === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${dto.receiptId}" does not exist for this account.`)
    }
    if (dto.deviceReadFailure !== undefined) return this.recordDeviceFailure(userId, owned, dto.deviceReadFailure)

    // The same file again (ADR-0097 §7): read, so it is filed, but its drafts stay with the first upload.
    const original = owned !== null && dto.allowDuplicate !== true ? await this.originalOf(userId, owned.id) : null
    const readDto = original !== null ? { ...dto, stageDraft: false } : dto
    let response: ParseReceiptResponseDto
    try {
      response = await this.read(userId, readDto, owned)
    } catch (error) {
      // A request the user can correct (an unknown person, an unsupported kind) is no read; a crash is.
      if (owned !== null && !(error instanceof DomainError)) {
        await this.receiptRepository.recordRead(userId, owned.id, { outcome: 'fehler', reason: 'lesefehler', draftsTaxYear: null })
      }
      throw error
    }

    const draftsTaxYear = response.draftsTaxYear ?? (stagedAnything(response) ? dto.taxYear : null)
    const filedInTaxYear = draftsTaxYear !== null && draftsTaxYear !== dto.taxYear ? draftsTaxYear : null
    const done: ParseReceiptResponseDto = { ...response, draftsTaxYear, filedInTaxYear, noValuesReason: response.noValuesReason ?? null, duplicateOf: duplicateDto(original ?? undefined) }
    if (owned === null) return { ...done, processing: null }
    const facts = readFactsOf(owned, dto, done, original !== null)
    const recorded = facts === null ? owned : ((await this.receiptRepository.recordRead(userId, owned.id, facts)) ?? owned)
    return { ...done, processing: await this.processingNow(userId, recorded) }
  }

  /** The device could not produce text: nothing to read, and the Beleg says so instead of staying „neu“. */
  private async recordDeviceFailure(userId: string, owned: ReceiptRecord | null, failure: DeviceReadFailure): Promise<ParseReceiptResponseDto> {
    if (owned === null) throw new InvalidInputError('RECEIPT_ID_REQUIRED', '"deviceReadFailure" needs the "receiptId" of the stored Beleg.')
    const recorded = (await this.receiptRepository.recordRead(userId, owned.id, { outcome: 'fehler', reason: DEVICE_FAILURE_REASON[failure], draftsTaxYear: null })) ?? owned
    return {
      mode: 'deterministic_fallback',
      securityBlocked: false,
      parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: 'Beleg nicht lesbar.', taxYear: null },
      stagedAction: null,
      assistantMessage: null,
      draftsTaxYear: null,
      filedInTaxYear: null,
      noValuesReason: null,
      duplicateOf: null,
      processing: await this.processingNow(userId, recorded),
    }
  }

  private async originalOf(userId: string, receiptId: string): Promise<ReceiptRecord | null> {
    if (this.storage === undefined) return null
    const keys = await this.storage.listContentKeys(userId)
    if (!keys.some((k) => k.receiptId === receiptId)) return null
    return originalsByContent(await this.receiptRepository.findAllForUser(userId), keys).get(receiptId) ?? null
  }

  private async processingNow(userId: string, record: ReceiptRecord) {
    const drafts = draftsByReceipt((await this.advisor?.receiptDrafts(userId)) ?? []).get(record.id) ?? []
    return { ...processingOf(record, drafts) }
  }

  /** Routes the text to its reader and decides whose the document is (ADR-0092) before it is read. */
  private async read(userId: string, dto: ParseReceiptDto, owned: ReceiptRecord | null): Promise<ParseReceiptResponseDto> {
    const kind = this.kindFor(dto)
    const strategy = this.registry.resolve(kind)
    if (strategy === null) {
      throw new InvalidInputError('RECEIPT_KIND_UNSUPPORTED', `Belegart "${kind}" wird nicht unterstützt.`)
    }

    // The Belege inbox files by kind: what the reader recognised is written back, so the tab does not show it as „Sonstiges“.
    await this.rememberRecognisedKind(userId, owned, kind, dto.rawText ?? '')

    // Whose the document is (ADR-0092): one rule for the masks, the Belege tab and the chat.
    const rawText = dto.rawText ?? ''
    const scope = holderScopeOf(kind, rawText)
    if (this.advisor === undefined || scope === 'none') return strategy.parse(userId, dto)
    const members = await this.advisor.householdMembers(userId, dto.taxYear)
    const chosen = dto.holder ?? dto.person
    const area = dto.area
    for (const ref of [chosen, area]) {
      if (ref !== undefined && (!isHolderRef(ref) || !members.some((m) => m.ref === ref))) {
        throw new InvalidInputError('BELEG_HOLDER_UNKNOWN', `"${ref}" is nobody of this household in ${dto.taxYear}.`)
      }
    }
    const printed = printedPersonNames(kind, rawText)
    const decision = decideDocumentHolder({
      scope,
      members,
      printed,
      rawText,
      ...(chosen !== undefined ? { chosen: chosen as HolderRef } : {}),
      ...(area !== undefined ? { area: area as HolderRef } : {}),
    })
    if (decision.kind === 'ask') return askWhose(decision, members)

    const holder = decision.holder
    const response = await strategy.parse(userId, { ...dto, person: holderPerson(holder), holder })
    const linked = owned?.holderTaxYear === dto.taxYear ? [...(owned.holders ?? [])] : []
    const holders = dto.alsoFor === true ? [...linked.filter((h) => h !== holder), holder] : [holder, ...linked.slice(1).filter((h) => h !== holder)]
    if (owned !== null) await this.receiptRepository.setHolders(userId, owned.id, holders, dto.taxYear)
    const assignment: DocumentAssignmentDto = {
      holder: personDto(holder, members),
      question: null,
      alsoFor: otherNamedMembers(scope, printed, members, holder, holders, rawText).map((ref) => personDto(ref, members)),
    }
    return { ...response, assignment }
  }

  /**
   * The reader for the text. An explicit `kind` forces one. Otherwise a German LStB, a Swiss salary
   * certificate, pension statement or premium letter goes to its own reader, which reads all its figures
   * instead of one field; a text no reader claims goes to the one the entry point expects, else the generic one.
   */
  private kindFor(dto: ParseReceiptDto): DocumentKind {
    const requested = dto.kind ?? 'auto'
    if (requested !== 'auto') return requested
    const detected = classifyDocumentKind(dto.rawText ?? '')
    if (detected !== 'auto' && this.registry.resolve(detected)) return detected
    const expected = dto.expectedKind ?? (dto.mask !== undefined ? MASK_EXPECTS[dto.mask] : undefined)
    return expected !== undefined && this.registry.resolve(expected) ? expected : 'auto'
  }

  /** Never overwrites a kind the user chose: only an unclassified (null) or generic (Sonstiges) Beleg takes the recognised one. */
  private async rememberRecognisedKind(userId: string, owned: ReceiptRecord | null, kind: string, rawText: string): Promise<void> {
    if (owned === null || (owned.kind !== undefined && owned.kind !== 'Sonstiges')) return
    const recognised = receiptKindOfDocument(kind === 'auto' ? classifyDocumentKind(rawText) : (kind as DetectedDocumentKind))
    if (recognised !== null) await this.receiptRepository.setKind(userId, owned.id, recognised)
  }

  private assertValidPayload(dto: ParseReceiptDto): void {
    if (dto.mimeType && !ALLOWED_RECEIPT_PARSE_MIME_TYPES.includes(dto.mimeType)) {
      throw new InvalidInputError('RECEIPT_MIME_INVALID', 'Ungültiger Dateityp (erlaubt sind JPEG, PNG, WebP oder PDF).')
    }
    if (!dto.rawText?.trim() && !dto.fileName.trim()) {
      throw new InvalidInputError('RECEIPT_EMPTY', 'Bitte gib einen Belegtext an.')
    }
  }
}

/** Whether the read staged any draft (the drafts of a document come as one owl message). */
function stagedAnything(response: ParseReceiptResponseDto): boolean {
  return response.stagedAction != null || (response.assistantMessage?.meta?.actions?.length ?? 0) > 0 || response.assistantMessage?.meta?.action != null
}

/** The reader stopped to ask whose the document is: nothing was read yet, so nothing is recorded. */
function askedWhose(response: ParseReceiptResponseDto): boolean {
  return response.assignment?.question != null || [response.lstb, response.chLohnausweis, response.chLetter].some((r) => r != null && r.personUnclear && r.stagedActionIds.length === 0)
}

/** Another person's document whose own account B keeps (ADR-0054): nothing for this return. */
function otherAccount(response: ParseReceiptResponseDto): boolean {
  return [response.lstb, response.chLohnausweis, response.chLetter].some((r) => r != null && r.personNotRecordable)
}


/**
 * What this read found out (ADR-0097 §2), or null when it decided nothing: the reader asked whose the
 * document is, or the client only peeked (`stageDraft: false`) without asking for its values.
 */
function readFactsOf(owned: ReceiptRecord, dto: ParseReceiptDto, response: ParseReceiptResponseDto, duplicate: boolean): RecordReadData | null {
  if (askedWhose(response)) return null
  // The year the drafts went to becomes the Beleg's year; a year the user chose stays (ADR-0097 §5).
  if (response.draftsTaxYear != null) {
    return { outcome: 'werte', reason: null, draftsTaxYear: response.draftsTaxYear, ...(owned.taxYear == null ? { taxYear: response.draftsTaxYear } : {}) }
  }
  if (duplicate) return { outcome: 'nichts', reason: 'dublette', draftsTaxYear: null }
  if (dto.stageDraft === false) return null
  const reason: ReceiptReadReason = otherAccount(response) ? 'anderes_konto' : (response.noValuesReason ?? (response.securityBlocked ? 'blockiert' : 'nichts_erkannt'))
  return { outcome: 'nichts', reason, draftsTaxYear: null }
}

/**
 * The Beleg kind that honestly describes a recognised document, or null when none of the stored kinds does:
 * a German Lohnsteuerbescheinigung is no Swiss Lohnausweis, and the employer's premium letter (Krankentaggeld,
 * NBU) is no insurer's statement, so both stay as they are.
 */
export function receiptKindOfDocument(detected: DetectedDocumentKind): ReceiptType | null {
  switch (detected) {
    case 'chLohnausweis':
      return 'Lohnausweis'
    case 'chPensionskasse':
      return 'Pensionskasse'
    case 'chKrankenkasse':
      return 'Krankenkasse'
    default:
      return null
  }
}

function personDto(ref: HolderRef, members: readonly AssignmentMember[]): AssignmentPersonDto {
  return { holder: ref, name: members.find((m) => m.ref === ref)?.firstName ?? null }
}

/** Nothing is read or staged yet: the user says whose the document is first. */
function askWhose(decision: Extract<AssignmentDecision, { kind: 'ask' }>, members: readonly AssignmentMember[]): ParseReceiptResponseDto {
  const summary =
    decision.reason === 'confirmSelf' && decision.printedName !== null
      ? `Der Beleg lautet auf ${decision.printedName}. Bist du das?`
      : decision.reason === 'contradiction' && decision.area !== null
        ? `Der Beleg lautet auf ${decision.printedName ?? 'jemand anderen'}, du bist bei ${members.find((m) => m.ref === decision.area)?.firstName ?? 'dir'} – für wen?`
        : decision.reason === 'unknown' && decision.printedName !== null
          ? `Der Beleg lautet auf ${decision.printedName}. Für wen ist er?`
          : 'Für wen ist dieser Beleg?'
  return {
    mode: 'deterministic_fallback',
    securityBlocked: false,
    parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary, taxYear: null },
    stagedAction: null,
    assistantMessage: null,
    assignment: {
      holder: null,
      question: {
        reason: decision.reason,
        options: decision.options.map((ref) => personDto(ref, members)),
        preselected: decision.preselected,
        printedName: decision.printedName,
        area: decision.area === null ? null : personDto(decision.area, members),
        offerCreate: [...decision.offerCreate],
      },
      alsoFor: [],
    },
  }
}

/** A Swiss salary certificate, by the same rule the app uses to route an upload. */
export function looksLikeChSalaryCertificate(rawText: string | undefined): boolean {
  return classifyDocumentKind(rawText ?? '') === 'chLohnausweis'
}
