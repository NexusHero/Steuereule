import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { LohnausweisFeldDto } from './lohnausweis-feld.dto.js'
import { WechselkursDto } from './wechselkurs.dto.js'
import { ChPostenDto, NGreAngabenDto } from './ch-posten.dto.js'

/** The derived fold result. */
export class BerechnungsstandDto {
  @ApiProperty({ enum: ['bestimmt', 'offen'], description: 'Determined, or open (naming what blocks).' })
  kind!: 'bestimmt' | 'offen'

  @ApiProperty({ type: Number, description: 'Sum of Einnahme Posten (whole euros).' })
  einnahmen!: number

  @ApiProperty({ type: Number, description: 'Sum of Vorsorgeaufwand Posten (whole euros).' })
  vorsorgeaufwand!: number

  @ApiProperty({ type: Number, description: 'Sum of Anrechnung Posten (whole euros).' })
  anrechnung!: number

  @ApiPropertyOptional({ type: Number, description: 'Required-but-empty line items (only when offen).' })
  offenePosten?: number

  @ApiPropertyOptional({ type: Number, description: 'Open conflicts (only when offen).' })
  konflikte?: number

  @ApiPropertyOptional({ type: [String], description: 'Gated Einkunftsarten (only when offen).' })
  gegated?: string[]
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/ch-lohnausweis` and every PUT. */
export class ChLohnausweisResponseDto {
  @ApiProperty({ type: [LohnausweisFeldDto], description: 'The 14 CHF-betrag fields, in paper order (Ziffern 1–14).' })
  felder!: LohnausweisFeldDto[]

  @ApiProperty({ type: String, nullable: true, description: 'Ziffer 15 Bemerkungen (Freitext), null when not entered.' })
  bemerkungen!: string | null

  @ApiProperty({ type: WechselkursDto, nullable: true, description: 'The Wechselkurs, null when not yet set.' })
  wechselkurs!: WechselkursDto | null

  @ApiProperty({
    type: String,
    enum: ['echter-grenzgaenger', 'kein-grenzgaenger'],
    nullable: true,
    description: 'The derived Grenzgänger-Status (ADR-013); null while ch-wohnsitz is unanswered.',
  })
  status!: string | null

  @ApiProperty({ type: [ChPostenDto], description: 'The folded CH line items (empty until the Kurs + status exist).' })
  posten!: ChPostenDto[]

  @ApiProperty({ type: BerechnungsstandDto, nullable: true, description: 'The fold result, null until foldable.' })
  stand!: BerechnungsstandDto | null

  @ApiProperty({ type: NGreAngabenDto, description: 'The Anlage-N-Gre facts beyond the Lohnausweis.' })
  nGre!: NGreAngabenDto
}
