import { ApiProperty } from '@nestjs/swagger'
import type { FreischaltungStatus } from '../freischaltung.service.js'

export class FreischaltungStatusDto {
  @ApiProperty({
    enum: ['freigeschaltet', 'offen', 'nicht-verfuegbar'],
    description:
      'freigeschaltet = paid for this tax year; offen = payable; nicht-verfuegbar = payment is not configured on this environment.',
  })
  status!: FreischaltungStatus
}

export class CheckoutResponseDto {
  @ApiProperty({ type: String, example: 'https://checkout.stripe.com/c/pay/cs_test_…' })
  checkoutUrl!: string
}
