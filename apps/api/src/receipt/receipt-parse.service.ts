import { classifyDocumentKind } from '@steuereule/core'
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  ALLOWED_RECEIPT_PARSE_MIME_TYPES,
  type ParseReceiptDto,
  type ParseReceiptResponseDto,
} from './dto/parse-receipt.dto.js'
import { AutoReceiptParseStrategy } from './parse/auto-receipt-parse.strategy.js'
import { DocumentParseRegistry } from './parse/document-parse.registry.js'
import { RECEIPT_REPOSITORY, type ReceiptRepository } from './receipt.repository.js'

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
  ) {}

  onModuleInit(): void {
    this.registry.register(this.autoStrategy)
  }

  async parseReceipt(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    this.assertValidPayload(dto)
    if (dto.receiptId) {
      const owned = await this.receiptRepository.findByIdForUser(userId, dto.receiptId)
      if (owned === null) {
        throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${dto.receiptId}" does not exist for this account.`)
      }
    }
    // A Swiss salary certificate uploaded as a general receipt goes to its own reader, which reads
    // every Ziffer instead of one field.
    const requested = dto.kind ?? 'auto'
    const kind = requested === 'auto' && looksLikeChSalaryCertificate(dto.rawText) && this.registry.resolve('chLohnausweis') ? 'chLohnausweis' : requested
    const strategy = this.registry.resolve(kind)
    if (strategy === null) {
      throw new InvalidInputError('RECEIPT_KIND_UNSUPPORTED', `Belegart "${kind}" wird nicht unterstützt.`)
    }
    return strategy.parse(userId, dto)
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

/** A Swiss salary certificate, by the same rule the app uses to route an upload. */
export function looksLikeChSalaryCertificate(rawText: string | undefined): boolean {
  return classifyDocumentKind(rawText ?? '') === 'chLohnausweis'
}
