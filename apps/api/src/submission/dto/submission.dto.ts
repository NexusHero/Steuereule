import { ApiProperty } from '@nestjs/swagger'
import { ISO_DATE_PATTERN, TAX_YEAR_STATUSES } from '@steuereule/core'
import { IsString, Matches } from 'class-validator'

/** `POST /v1/steuerjahre/{jahr}/abgabe`: the day the user filed the printed return himself. */
export class SubmitTaxReturnDto {
  @ApiProperty({
    type: String,
    example: '2026-03-14',
    pattern: ISO_DATE_PATTERN.source,
    description: 'ISO yyyy-mm-dd; after the tax year ended and not in the future (the app proposes today).',
  })
  @IsString()
  @Matches(ISO_DATE_PATTERN)
  submittedOn!: string
}

/** The answer to a recorded submission. */
export class SubmissionResultDto {
  @ApiProperty({ type: String, enum: ['eingereicht'], example: 'eingereicht' })
  status!: 'eingereicht'

  @ApiProperty({ type: String, example: '2026-03-14' })
  submittedOn!: string

  @ApiProperty({ type: Boolean, example: false, description: 'True when a version filed earlier was replaced (a corrected return).' })
  replacedPrevious!: boolean
}

/** The Abgabe as the cockpit shows it (ADR-0098 §8). */
export class CockpitSubmissionDto {
  @ApiProperty({ type: String, enum: TAX_YEAR_STATUSES, example: 'eingereicht', description: 'The ADR-0039 state of the year.' })
  status!: (typeof TAX_YEAR_STATUSES)[number]

  @ApiProperty({ type: String, example: '2026-03-14', description: 'ISO yyyy-mm-dd, the day the user filed.' })
  submittedOn!: string

  @ApiProperty({ type: Boolean, example: true, description: 'Whether „Abgabe zurücknehmen“ is offered: until a Bescheid is recorded.' })
  withdrawable!: boolean
}
