import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { SalaryCertificateFieldDto } from './salary-certificate-field.dto.js'
import { ExchangeRateDto } from './exchange-rate.dto.js'
import { ChItemDto, NGreDetailsDto } from './ch-item.dto.js'

/** The derived fold result. */
export class CalculationStatusDto {
  @ApiProperty({ enum: ['bestimmt', 'offen'], description: 'Determined, or open (naming what blocks).' })
  kind!: 'bestimmt' | 'offen'

  @ApiProperty({ type: Number, description: 'Sum of Einnahme Posten (whole euros).' })
  einnahmen!: number

  @ApiProperty({ type: Number, description: 'Sum of Vorsorgeaufwand Posten (whole euros).' })
  vorsorgeaufwand!: number

  @ApiProperty({ type: Number, description: 'Sum of Anrechnung Posten (whole euros).' })
  anrechnung!: number

  @ApiPropertyOptional({ type: Number, description: 'Required-but-empty line items (only when offen).' })
  openItems?: number

  @ApiPropertyOptional({ type: Number, description: 'Open conflicts (only when offen).' })
  conflicts?: number

  @ApiPropertyOptional({ type: [String], description: 'Gated Einkunftsarten (only when offen).' })
  gated?: string[]
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/ch-lohnausweis` and every PUT. */
export class ChSalaryCertificateResponseDto {
  @ApiProperty({ type: [SalaryCertificateFieldDto], description: 'The 14 CHF-betrag fields, in paper order (Ziffern 1–14).' })
  fields!: SalaryCertificateFieldDto[]

  @ApiProperty({ type: String, nullable: true, description: 'Ziffer 15 Bemerkungen (Freitext), null when not entered.' })
  bemerkungen!: string | null

  @ApiProperty({ type: ExchangeRateDto, nullable: true, description: 'The Wechselkurs, null when not yet set.' })
  exchangeRate!: ExchangeRateDto | null

  @ApiProperty({
    type: String,
    enum: ['echter-grenzgaenger', 'kein-grenzgaenger'],
    nullable: true,
    description: 'The derived Grenzgänger-Status (ADR-013); null while ch-wohnsitz is unanswered.',
  })
  status!: string | null

  @ApiProperty({ type: [ChItemDto], description: 'The folded CH line items (empty until the Kurs + status exist).' })
  items!: ChItemDto[]

  @ApiProperty({ type: CalculationStatusDto, nullable: true, description: 'The fold result, null until foldable.' })
  foldStatus!: CalculationStatusDto | null

  @ApiProperty({ type: NGreDetailsDto, description: 'The Anlage-N-Gre facts beyond the Lohnausweis.' })
  nGre!: NGreDetailsDto
}
