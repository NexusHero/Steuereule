import { Inject, Injectable } from '@nestjs/common'
import type { AdvisorActionProposal, HolderRef } from '@steuereule/core'
import { AdvisorDocumentStaging } from '../advisor/advisor-document-staging.js'
import { AdvisorDrafts } from '../advisor/advisor-drafts.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import type { ReassignReceiptDto, ReassignReceiptResponseDto } from './dto/reassign-receipt.dto.js'
import { ReceiptParseService } from './receipt-parse.service.js'
import { RECEIPT_REPOSITORY, type ReceiptRepository } from './receipt.repository.js'

/**
 * „für: <Name>“ — one tap gives a document to another person of the household (ADR-0092 §4). What came
 * from it moves along: at the person before, every value still as the document wrote it is taken back
 * (values changed since or from other sources stay); the document is read again for the new holder and
 * its values are written right away where nothing else is in the field. Where something is, the user
 * says „zusätzlich oder ersetzen?“ first.
 */
@Injectable()
export class ReceiptReassignService {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly receipts: ReceiptRepository,
    @Inject(ReceiptParseService) private readonly parser: ReceiptParseService,
    @Inject(AdvisorDocumentStaging) private readonly staging: AdvisorDocumentStaging,
    @Inject(AdvisorDrafts) private readonly drafts: AdvisorDrafts,
  ) {}

  async reassign(userId: string, receiptId: string, dto: ReassignReceiptDto): Promise<ReassignReceiptResponseDto> {
    const owned = await this.receipts.findByIdForUser(userId, receiptId)
    if (owned === null) throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${receiptId}" does not exist for this account.`)
    const members = await this.staging.householdMembers(userId, dto.taxYear)
    if (!members.some((m) => m.ref === dto.holder)) {
      throw new InvalidInputError('BELEG_HOLDER_UNKNOWN', `"${dto.holder}" is nobody of this household in ${dto.taxYear}.`)
    }
    const holder = dto.holder as HolderRef
    const takenBack = await this.staging.takeBackDocumentValues(userId, dto.taxYear, receiptId)
    await this.receipts.setHolders(userId, receiptId, [holder], dto.taxYear)
    if (!dto.rawText?.trim()) return { holders: [holder], takenBack, applied: 0, waiting: 0, parse: null }

    const parse = await this.parser.parseReceipt(userId, {
      taxYear: dto.taxYear,
      fileName: owned.fileName,
      rawText: dto.rawText,
      receiptId,
      holder,
      ...(dto.textSource ? { textSource: dto.textSource } : {}),
    })
    const staged = [parse.assistantMessage?.meta?.action, ...(parse.assistantMessage?.meta?.actions ?? [])].filter(
      (a): a is AdvisorActionProposal => a !== undefined && a.status === 'pending',
    )
    // A move writes at once what had been taken over before; a first assignment only prepares drafts.
    const plain = takenBack > 0 ? staged.filter((a) => a.combination === undefined) : []
    let applied = 0
    if (plain.length > 0) {
      try {
        applied = (await this.drafts.applyBatch(userId, dto.taxYear, { drafts: plain.map((a) => ({ actionId: a.actionId })) })).actions.length
      } catch (error) {
        // A field changed in between: the drafts wait for the user, as any other.
        if (!(error instanceof ConflictError)) throw error
      }
    }
    return { holders: [holder], takenBack, applied, waiting: staged.length - applied, parse }
  }
}
