import { ApiProperty } from '@nestjs/swagger'

/** What this deployment offers beyond the core return, independent of any user or year. */
export class AppCapabilitiesDto {
  @ApiProperty({
    description: 'SELBSTSTAENDIGE_ENABLED (ADR-0101 §20): the self-employment path is on. Off, the interview stops „Selbstständig“ at the Gewerbe-Gate.',
    example: true,
    type: Boolean,
  })
  selbststaendig!: boolean
}
