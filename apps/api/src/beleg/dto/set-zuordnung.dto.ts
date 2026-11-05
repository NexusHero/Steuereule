import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional } from 'class-validator'

/** Request body for `POST /v1/belege/:id/zuordnung`. */
export class SetAssignmentDto {
  @ApiProperty({ type: Number, example: 2026, description: 'The calendar year to confirm/assign.' })
  @IsInt()
  steuerjahr!: number

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'ADR-008 "bei meinem Jahr bleiben": persist the dismissal of a contradicting date-derived suggestion, keeping `steuerjahr`. Omitted/false = a normal assignment.',
  })
  @IsOptional()
  @IsBoolean()
  vorschlagVerworfen?: boolean
}
