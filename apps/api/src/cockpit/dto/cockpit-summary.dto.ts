import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CockpitSubmissionDto } from '../../submission/dto/submission.dto.js'

/** The honest Cockpit stand, as a flat discriminated union on the wire: `kind` fixes which optional fields are present. */
export class CockpitStatusDto {
  @ApiProperty({ type: String, enum: ['bestimmt', 'spanne', 'gated'], example: 'spanne' })
  kind!: 'bestimmt' | 'spanne' | 'gated'

  @ApiPropertyOptional({ type: Number, example: 1444, description: 'The settled point value (only when kind === "bestimmt").' })
  value?: number

  @ApiPropertyOptional({ type: Number, example: 1227, description: 'Lower bound (only when kind === "spanne").' })
  from?: number

  @ApiPropertyOptional({ type: Number, example: 1587, description: 'Upper bound (only when kind === "spanne").' })
  to?: number

  @ApiPropertyOptional({ type: Number, example: 3, description: 'Still-open required line items (only when kind === "spanne").' })
  openItems?: number

  @ApiPropertyOptional({ type: Number, example: 1, description: 'Open posten conflicts, ADR-008 (only when kind === "spanne").' })
  conflicts?: number

  @ApiPropertyOptional({ type: Number, example: 1, description: 'Übernommene, noch unbestätigte Posten (ADR-021, only when kind === "spanne").' })
  unconfirmedItems?: number

  @ApiPropertyOptional({ type: Number, example: 50000, description: 'Einnahmen-Summe der unbestätigten Posten (ADR-021, only when kind === "spanne").' })
  unconfirmedSum?: number

  @ApiPropertyOptional({ type: Number, example: 0, description: 'The settled partial sum (only when kind === "gated").' })
  sum?: number

  @ApiPropertyOptional({ type: [String], example: ['Gewerbe'], description: 'The gated Einkunftsarten (only when kind === "gated").' })
  gated?: string[]
}

/** The one response shape for `GET /v1/steuerjahre/{jahr}/cockpit`. */
/** The recorded income of a joint return, split by person (Echtdatentest 18.11.2026). */
export class CockpitIncomeByPersonDto {
  @ApiProperty({ type: Number, example: 96300, description: 'Recorded wages and pension of Person A (EUR).' })
  a!: number

  @ApiProperty({ type: Number, example: 107000, description: 'Recorded wages and pension of Person B (EUR).' })
  b!: number
}

/** What this server offers (ADR-0101 §20): the app follows the server, never a client-side flag. */
export class CockpitCapabilitiesDto {
  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'SELBSTSTAENDIGE_ENABLED: „Selbstständig“/„Beides“ lead into the self-employment path (EÜR, Buch, USt, GewSt) instead of the Gewerbe-Gate.',
  })
  selbststaendig!: boolean
}

export class CockpitSummaryDto {
  @ApiProperty({ type: Number, example: 2026 })
  taxYear!: number

  @ApiProperty({ type: CockpitStatusDto })
  status!: CockpitStatusDto

  @ApiProperty({ type: Number, example: 3, description: 'Minimal-Gate questions still open (REQ-015 remainingSteps).' })
  openItems!: number

  @ApiPropertyOptional({ type: CockpitIncomeByPersonDto, description: 'Only for a joint return recorded in this account: the share of each person.' })
  byPerson?: CockpitIncomeByPersonDto

  @ApiProperty({
    type: CockpitSubmissionDto,
    nullable: true,
    description: 'The Abgabe (ADR-0098 §8): null until the user recorded „Ich habe die Erklärung abgegeben“.',
  })
  submission!: CockpitSubmissionDto | null

  // Optional on the wire only so older client fixtures stay valid; the server always sends it.
  @ApiPropertyOptional({ type: CockpitCapabilitiesDto, description: 'Server switches the app follows (always present).' })
  capabilities?: CockpitCapabilitiesDto

  // Optional on the wire only for older client fixtures; the server always sends it.
  @ApiPropertyOptional({
    enum: ['papier', 'elster-ausfuellhilfe'],
    description: 'How this year is filed: „papier“ with the printout (ADR-0050), „elster-ausfuellhilfe“ through Mein ELSTER with the fill-in help for a year with self-employment (switch on, ADR-0101 §16).',
  })
  filingPath?: 'papier' | 'elster-ausfuellhilfe'
}
