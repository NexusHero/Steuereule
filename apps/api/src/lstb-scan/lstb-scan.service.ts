import { Inject, Injectable } from '@nestjs/common'
import { AdvisorService } from '../advisor/advisor.service.js'
import { NotFoundError } from '../common/domain-error.js'
import type { LstbResponseDto } from '../lstb/dto/lstb-response.dto.js'
import { LstbService } from '../lstb/lstb.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../prisma/transaction.js'
import { ReceiptService } from '../receipt/receipt.service.js'
import type { ConfirmLstbScanDto } from './dto/confirm-lstb-scan.dto.js'

/**
 * „Werte übernehmen“ of a scanned LStB (#444, ADR-0008): one transaction writes all three
 * values with Beleg provenance and marks the staged advisor proposals as applied.
 */
@Injectable()
export class LstbScanService {
  constructor(
    @Inject(LstbService) private readonly lstbService: LstbService,
    @Inject(AdvisorService) private readonly advisorService: AdvisorService,
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
          sozialversicherung: dto.sozialversicherung,
        },
        { receiptId, overwriteExisting: dto.overwriteExisting === true, addToExisting: dto.addToExisting === true },
      )
      await this.advisorService.markLstbActionsApplied(actorUserId, taxYear, dto.actionIds ?? [])
      return response
    })
  }
}
