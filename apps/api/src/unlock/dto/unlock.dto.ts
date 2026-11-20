import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { UnlockStatus } from '../unlock.service.js'

export class UnlockStatusDto {
  @ApiProperty({
    enum: ['freigeschaltet', 'offen', 'nicht-verfuegbar'],
    description:
      'freigeschaltet = paid for this tax year; offen = payable; nicht-verfuegbar = payment is not configured on this environment.',
  })
  status!: UnlockStatus

  @ApiPropertyOptional({ enum: ['standard', 'selbststaendig'], description: 'The price tier this year needs (ADR-0101 §21); always sent.' })
  tier?: 'standard' | 'selbststaendig'

  @ApiPropertyOptional({ enum: ['papier', 'elster-ausfuellhilfe'], description: 'How the year is filed: the paper printout, or Mein ELSTER with the fill-in help (self-employment, ADR-0101 §16); always sent.' })
  filingPath?: 'papier' | 'elster-ausfuellhilfe'
}

export class CheckoutResponseDto {
  @ApiProperty({ type: String, example: 'https://checkout.stripe.com/c/pay/cs_test_…' })
  checkoutUrl!: string
}
