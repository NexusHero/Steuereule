import { ApiProperty } from '@nestjs/swagger'
import { IsInt } from 'class-validator'

/**
 * Request body for `POST /v1/belege/:id/zuordnung` (ADR-007) — the tap that confirms a
 * year, or a manual assignment. The CONFLICT is not a separate field the client sets:
 * assigning a year that contradicts the dates persists the year, and the derived state
 * (in the response) reports `konflikt` (ADR-008) — visible, never a silent overwrite.
 */
export class SetZuordnungDto {
  @ApiProperty({ type: Number, example: 2026, description: 'The calendar year to confirm/assign.' })
  @IsInt()
  steuerjahr!: number
}
