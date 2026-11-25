import { ApiProperty } from '@nestjs/swagger'

/** ADR-0030: whether the address is confirmed, and if not, the earliest date the account may be deleted. */
export class AccountVerificationDto {
  @ApiProperty({ type: Boolean, example: false })
  emailVerified!: boolean

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-12-01T10:00:00.000Z',
    description:
      'For a never-verified account: no sooner than this moment the sweep deletes it (30 days after registration, 7 days after the warning; a floor, the sweep runs on traffic). Null once verified.',
  })
  deletionNotBefore!: string | null
}
