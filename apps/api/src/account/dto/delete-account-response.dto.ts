import { ApiProperty } from '@nestjs/swagger'

/** The honest teardown summary: exactly what was erased vs. anonymised-and-retained vs. held under active Löschschutz. */
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

/** One resource kept back by a legal hold: what, how many rows, until when, on what legal basis. */
export class RetainedHoldDto {
  @ApiProperty({ type: String, example: 'unlock', description: '"unlock" (payments), "filingVersion" (submitted versions), or an operator category hold ("profile", "taxData", "auditLog").' })
  resource!: string

  @ApiProperty({ type: Number, example: 1 })
  count!: number

  @ApiProperty({ type: String, format: 'date-time', example: '2035-01-01T00:00:00.000Z', description: 'When the hold ends; the rows are deleted after it.' })
  until!: string

  @ApiProperty({ type: String, nullable: true, example: '§ 147 AO, § 257 HGB' })
  reason!: string | null
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

  @ApiProperty({ type: [RetainedHoldDto], description: 'What the legal holds kept back and until when (P7); empty when nothing was held.' })
  legalHolds!: RetainedHoldDto[]
}
