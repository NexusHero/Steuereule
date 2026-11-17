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
  type ReceiptType,
} from '@steuereule/core'
import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common'
import { AdvisorService } from '../advisor/advisor.service.js'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  ALLOWED_RECEIPT_PARSE_MIME_TYPES,
  type AssignmentPersonDto,
  type DocumentAssignmentDto,
  type ParseReceiptDto,
  type ParseReceiptResponseDto,
} from './dto/parse-receipt.dto.js'
import { AutoReceiptParseStrategy } from './parse/auto-receipt-parse.strategy.js'
import { DocumentParseRegistry } from './parse/document-parse.registry.js'
import { RECEIPT_REPOSITORY, type ReceiptRecord, type ReceiptRepository } from './receipt.repository.js'

/**
 * Entry point of `POST /v1/belege/parse`: validates the payload, checks that a referenced
 * Beleg belongs to the caller, and dispatches to the strategy registered for `kind`.
 * Zero-Write: strategies only stage advisor proposals, never domain values.
 */
@Injectable()
export class ReceiptParseService implements OnModuleInit {
  constructor(
    @Inject(DocumentParseRegistry) private readonly registry: DocumentParseRegistry,
    @Inject(AutoReceiptParseStrategy) private readonly autoStrategy: AutoReceiptParseStrategy,
    @Inject(RECEIPT_REPOSITORY) private readonly receiptRepository: ReceiptRepository,
    /** The household, to tell whose a document is (ADR-0092). Without it every document is read as before. */
    @Optional() @Inject(AdvisorService) private readonly advisor?: AdvisorService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.autoStrategy)
  }

  async parseReceipt(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    this.assertValidPayload(dto)
    const owned = dto.receiptId ? await this.receiptRepository.findByIdForUser(userId, dto.receiptId) : null
    if (dto.receiptId && owned === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${dto.receiptId}" does not exist for this account.`)
    }
    // A German LStB, a Swiss salary certificate, pension statement or premium letter uploaded as a general
    // receipt (chat, API, MCP) goes to its own reader, which reads all its figures instead of one field.
    const requested = dto.kind ?? 'auto'
    const detected = requested === 'auto' ? classifyDocumentKind(dto.rawText ?? '') : requested
    const kind = detected !== requested && this.registry.resolve(detected) ? detected : requested
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
