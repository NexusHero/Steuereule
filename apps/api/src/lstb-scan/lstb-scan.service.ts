import { Inject, Injectable } from '@nestjs/common'
import { AdvisorDocumentStaging } from '../advisor/advisor-document-staging.js'
import { NotFoundError } from '../common/domain-error.js'
import type { LstbResponseDto } from '../lstb/dto/lstb-response.dto.js'
import { LstbService } from '../lstb/lstb.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../common/transaction-runner.js'
import { ReceiptService } from '../receipt/receipt.service.js'
import type { ConfirmLstbScanDto } from './dto/confirm-lstb-scan.dto.js'

/**
 * „Werte übernehmen“ of a scanned LStB (#444, ADR-0008): one transaction writes the three values
 * and every further line confirmed with them, with Beleg provenance, and marks the staged advisor
 * proposals as applied.
 */
@Injectable()
export class LstbScanService {
  constructor(
    @Inject(LstbService) private readonly lstbService: LstbService,
    @Inject(AdvisorDocumentStaging) private readonly staging: AdvisorDocumentStaging,
    @Inject(ReceiptService) private readonly receiptService: ReceiptService,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  async confirm(
    actorUserId: string,
    targetUserId: string,
    taxYear: number,
    dto: ConfirmLstbScanDto,
  ): Promise<LstbResponseDto> {
    const receiptId = dto.receiptId ?? null
    if (receiptId !== null && !(await this.receiptService.isOwnedBy(actorUserId, receiptId))) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${receiptId}" does not exist for this account.`)
    }
    return this.transactions.run(async () => {
      const response = await this.lstbService.applyScannedValues(
        targetUserId,
        taxYear,
        {
          bruttoarbeitslohn: dto.bruttoarbeitslohn,
          lohnsteuer: dto.lohnsteuer,
          sozialversicherung: dto.sozialversicherung ?? null,
        },
        { receiptId, overwriteExisting: dto.overwriteExisting === true, addToExisting: dto.addToExisting === true },
      )
      // The further lines in the same step: a value refused above writes none of them either.
      const adding = dto.addToExisting === true
      await this.lstbService.applyScannedLines(targetUserId, taxYear, { lines: dto.lines ?? {}, arbeitgeber: dto.arbeitgeber ?? null }, { receiptId, addToExisting: adding })
      const after = dto.lines !== undefined && Object.keys(dto.lines).length > 0 ? await this.lstbService.getState(targetUserId, taxYear) : response
      await this.staging.markLstbActionsApplied(actorUserId, taxYear, dto.actionIds ?? [])
      return after
    })
  }
}
