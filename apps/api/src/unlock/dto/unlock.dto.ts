import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { UnlockStatus } from '../unlock.service.js'

/** A price as the checkout charges it (WEB-16): gross, in the currency's minor unit. */
export class UnlockPriceDto {
  @ApiProperty({ type: Number, example: 3499, description: 'Gross amount in cents, VAT included.' })
  amountCents!: number

  @ApiProperty({ type: String, example: 'eur', description: 'ISO 4217 currency code, lower case as Stripe writes it.' })
  currency!: string
}

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

  @ApiPropertyOptional({
    type: UnlockPriceDto,
    nullable: true,
    description: 'What the checkout of this year would charge, read from the same price the checkout uses; sent while `offen`, null when it cannot be read.',
  })
  price?: UnlockPriceDto | null
}

export class CheckoutResponseDto {
  @ApiProperty({ type: String, example: 'https://checkout.stripe.com/c/pay/cs_test_…' })
  checkoutUrl!: string
}
