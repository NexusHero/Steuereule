import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** The honest Cockpit stand, as a flat discriminated union on the wire: `kind` fixes which optional fields are present. */
export class CockpitStandDto {
  @ApiProperty({ type: String, enum: ['bestimmt', 'spanne', 'gated'], example: 'spanne' })
  kind!: 'bestimmt' | 'spanne' | 'gated'

  @ApiPropertyOptional({ type: Number, example: 1444, description: 'The settled point value (only when kind === "bestimmt").' })
  wert?: number

  @ApiPropertyOptional({ type: Number, example: 1227, description: 'Lower bound (only when kind === "spanne").' })
  von?: number

  @ApiPropertyOptional({ type: Number, example: 1587, description: 'Upper bound (only when kind === "spanne").' })
  bis?: number

  @ApiPropertyOptional({ type: Number, example: 3, description: 'Still-open required line items (only when kind === "spanne").' })
  offenePosten?: number

  @ApiPropertyOptional({ type: Number, example: 1, description: 'Open posten conflicts, ADR-008 (only when kind === "spanne").' })
  konflikte?: number

  @ApiPropertyOptional({ type: Number, example: 1, description: 'Übernommene, noch unbestätigte Posten (ADR-021, only when kind === "spanne").' })
  unbestaetigte?: number

  @ApiPropertyOptional({ type: Number, example: 50000, description: 'Einnahmen-Summe der unbestätigten Posten (ADR-021, only when kind === "spanne").' })
  unbestaetigteSumme?: number

  @ApiPropertyOptional({ type: Number, example: 0, description: 'The settled partial sum (only when kind === "gated").' })
  summe?: number

  @ApiPropertyOptional({ type: [String], example: ['Gewerbe'], description: 'The gated Einkunftsarten (only when kind === "gated").' })
  gegated?: string[]
}

/** The one response shape for `GET /v1/steuerjahre/{jahr}/cockpit`. */
export class CockpitSummaryDto {
  @ApiProperty({ type: Number, example: 2026 })
  taxYear!: number

  @ApiProperty({ type: CockpitStandDto })
  stand!: CockpitStandDto

  @ApiProperty({ type: Number, example: 3, description: 'Minimal-Gate questions still open (REQ-015 remainingSteps).' })
  openItems!: number
}
