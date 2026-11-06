import { ApiProperty } from '@nestjs/swagger'
import type { UnlockStatus } from '../freischaltung.service.js'

export class UnlockStatusDto {
  @ApiProperty({
    enum: ['freigeschaltet', 'offen', 'nicht-verfuegbar'],
    description:
      'freigeschaltet = paid for this tax year; offen = payable; nicht-verfuegbar = payment is not configured on this environment.',
  })
  status!: UnlockStatus
}

export class CheckoutResponseDto {
  @ApiProperty({ type: String, example: 'https://checkout.stripe.com/c/pay/cs_test_…' })
  checkoutUrl!: string
}
