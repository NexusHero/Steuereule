import { ApiProperty } from '@nestjs/swagger'
import { CAPITAL_FIELDS, type CapitalFieldId } from '@steuereule/core'
import { CapitalFieldDto } from './kapital-feld.dto.js'

/** The depot-Einordnung — what the `kap-depot` answer MEANS for the Steuererklärung. */
export class DepotClassificationDto {
  @ApiProperty({
    type: String,
    enum: ['deutscher-broker', 'auslaendischer-broker', 'krypto', 'unbekannt'],
    example: 'deutscher-broker',
    description:
      'deutscher-broker = Abgeltungsteuer was withheld (Günstigerprüfung applies); ' +
      'auslaendischer-broker = no German tax withheld — KAP-Pflicht, personal tariff; ' +
      'krypto = gated in 1.0 (product ADR-032 §2); unbekannt = kap-depot not answered.',
  })
  kind!: 'deutscher-broker' | 'auslaendischer-broker' | 'krypto' | 'unbekannt'
}

/** The derived Kapital-Posten. */
export class CapitalItemDto {
  @ApiProperty({ type: String, example: 'kapital', description: 'The stable posten id.' })
  id!: string

  @ApiProperty({ type: Number, example: 2500, description: 'The Kapitalerträge (whole euros).' })
  amount!: number

  @ApiProperty({ type: String, example: 'eingabe', description: 'The Herkunft (Quelle art) of the amount.' })
  provenance!: string
}

/** The derived fold result. */
export class CapitalStatusDto {
  @ApiProperty({ enum: ['bestimmt', 'offen'], description: 'Determined, or open (naming what blocks).' })
  kind!: 'bestimmt' | 'offen'

  @ApiProperty({ type: Number, description: 'Sum of Einnahme Posten (whole euros).' })
  einnahmen!: number

  @ApiProperty({ type: Number, description: 'Sum of Vorsorgeaufwand Posten (whole euros).' })
  vorsorgeaufwand!: number

  @ApiProperty({ type: Number, description: 'Sum of Anrechnung Posten (whole euros).' })
  anrechnung!: number

  @ApiProperty({ type: Number, required: false, description: 'Required-but-empty line items (only when offen).' })
  openItems?: number

  @ApiProperty({ type: Number, required: false, description: 'Open conflicts (only when offen).' })
  conflicts?: number

  @ApiProperty({ type: [String], required: false, description: 'Gated Einkunftsarten (only when offen).' })
  gated?: string[]
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/kapital` and `PUT .../kapital/kapitalertraege`. */
export class CapitalResponseDto {
  @ApiProperty({ type: CapitalFieldDto })
  kapitalertraege!: CapitalFieldDto

  @ApiProperty({ type: CapitalFieldDto })
  sparerPauschbetrag!: CapitalFieldDto

  @ApiProperty({ type: CapitalFieldDto })
  kapitalertragsteuer!: CapitalFieldDto

  @ApiProperty({ type: CapitalFieldDto })
  solidaritaetszuschlag!: CapitalFieldDto

  @ApiProperty({ type: CapitalFieldDto })
  kirchensteuer!: CapitalFieldDto

  @ApiProperty({ enum: CAPITAL_FIELDS, isArray: true, description: 'The fields Anlage KAP needs for this depot.' })
  requiredFields!: CapitalFieldId[]

  @ApiProperty({ type: DepotClassificationDto })
  depot!: DepotClassificationDto

  @ApiProperty({ type: [CapitalItemDto], description: 'The Kapital-Posten (empty while not determinable).' })
  items!: CapitalItemDto[]

  @ApiProperty({ type: CapitalStatusDto })
  status!: CapitalStatusDto

  @ApiProperty({ enum: ['A', 'B', 'gemeinsam'], nullable: true, description: 'Whose depot (ADR-0054); null = Person A.' })
  inhaber!: 'A' | 'B' | 'gemeinsam' | null
}
