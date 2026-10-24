import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional } from 'class-validator'

/**
 * Request body for `POST /v1/belege/:id/zuordnung` (ADR-007/008) — the tap that confirms a
 * year, a manual assignment, or the "bei meinem Jahr bleiben" resolution. The CONFLICT is not
 * a separate field the client sets: assigning a year that contradicts the dates persists the
 * year, and the derived state (in the response) reports `konflikt` (ADR-008) — visible, never
 * a silent overwrite. `vorschlagVerworfen` is the explicit dismissal of a contradicting
 * date-derived suggestion, resolving that `konflikt` to `zugeordnet` on the caller's own year.
 */
export class SetZuordnungDto {
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
