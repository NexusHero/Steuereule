import { ApiProperty } from '@nestjs/swagger'

/**
 * The honest teardown summary (ADR-0013's frozen contract, §8's honesty invariant):
 * exactly what was erased vs. anonymised-and-retained vs. held under active
 * Löschschutz — never a vague "your data was deleted".
 */
export class DeletedSummaryDto {
  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'False only when an active LegalHold on "profile" exempted the row — it still exists, retained under legal obligation.',
  })
  profile!: boolean

  @ApiProperty({
    type: Boolean,
    enum: [true],
    example: true,
    description: 'Always true — the account (User, cascading Session/Account) and its Verification rows are always torn down; LegalHold never exempts login/identity itself.',
  })
  account!: true
}

export class DeleteAccountResponseDto {
  @ApiProperty({ type: DeletedSummaryDto })
  deleted!: DeletedSummaryDto

  @ApiProperty({
    type: Number,
    example: 0,
    description: 'Count of TaxDataAccessLog rows anonymised (userId severed to an irreversible tombstone) by this call — retained as the Art. 30 accountability record, no longer person-linkable.',
  })
  retainedAnonymisedAuditRows!: number

  @ApiProperty({
    type: Number,
    example: 0,
    description: 'Count of rows retained untouched — neither erased nor anonymised — because an active LegalHold exempted them.',
  })
  retainedUnderLegalHold!: number
}
