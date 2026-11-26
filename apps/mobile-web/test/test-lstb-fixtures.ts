import type { AdvisorActionProposalDto, LstbResponseDto } from '@steuereule/api-client'

/** A `GET .../lstb` answer with all three fields recorded, so the mask counts as complete. For tests only. */
export const COMPLETE_LSTB_RESPONSE: LstbResponseDto = {
  bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
  lohnsteuer: { kind: 'erfasst', value: 8000 },
  sozialversicherung: { kind: 'erfasst', value: 9000 },
  state: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
}

/** A pending LStB-scan proposal for one LStB field, the way a staged scan draft carries it. For tests only. */
export function pendingLstbScanAction(
  action: Pick<AdvisorActionProposalDto, 'actionId' | 'field' | 'label' | 'newValue' | 'calculation'>,
): AdvisorActionProposalDto {
  return {
    status: 'pending',
    screen: 'lstb',
    beforeRefundEur: 0,
    afterRefundEur: 0,
    deltaEur: 0,
    reason: 'LStB-Scan',
    sourceId: 'estg-9-1',
    confidenceStatus: 'ok',
    ...action,
  }
}
