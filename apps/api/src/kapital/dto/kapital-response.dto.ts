import { ApiProperty } from '@nestjs/swagger'
import { KAPITAL_FELDER, type KapitalFeldId } from '@steuereule/core'
import { KapitalFeldDto } from './kapital-feld.dto.js'

/** The depot-Einordnung — what the `kap-depot` answer MEANS for the Steuererklärung. */
export class DepotEinordnungDto {
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
export class KapitalPostenDto {
  @ApiProperty({ type: String, example: 'kapital', description: 'The stable posten id.' })
  id!: string

  @ApiProperty({ type: Number, example: 2500, description: 'The Kapitalerträge (whole euros).' })
  betrag!: number

  @ApiProperty({ type: String, example: 'eingabe', description: 'The Herkunft (Quelle art) of the amount.' })
  herkunft!: string
}

/** The derived fold result. */
export class KapitalStandDto {
  @ApiProperty({ enum: ['bestimmt', 'offen'], description: 'Determined, or open (naming what blocks).' })
  kind!: 'bestimmt' | 'offen'

  @ApiProperty({ type: Number, description: 'Sum of Einnahme Posten (whole euros).' })
  einnahmen!: number

  @ApiProperty({ type: Number, description: 'Sum of Vorsorgeaufwand Posten (whole euros).' })
  vorsorgeaufwand!: number

  @ApiProperty({ type: Number, description: 'Sum of Anrechnung Posten (whole euros).' })
  anrechnung!: number

  @ApiProperty({ type: Number, required: false, description: 'Required-but-empty line items (only when offen).' })
  offenePosten?: number

  @ApiProperty({ type: Number, required: false, description: 'Open conflicts (only when offen).' })
  konflikte?: number

  @ApiProperty({ type: [String], required: false, description: 'Gated Einkunftsarten (only when offen).' })
  gegated?: string[]
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/kapital` and `PUT .../kapital/kapitalertraege`. */
export class KapitalResponseDto {
  @ApiProperty({ type: KapitalFeldDto })
  kapitalertraege!: KapitalFeldDto

  @ApiProperty({ type: KapitalFeldDto })
  sparerPauschbetrag!: KapitalFeldDto

  @ApiProperty({ type: KapitalFeldDto })
  kapitalertragsteuer!: KapitalFeldDto

  @ApiProperty({ type: KapitalFeldDto })
  solidaritaetszuschlag!: KapitalFeldDto

  @ApiProperty({ type: KapitalFeldDto })
  kirchensteuer!: KapitalFeldDto

  @ApiProperty({ enum: KAPITAL_FELDER, isArray: true, description: 'The fields Anlage KAP needs for this depot.' })
  pflichtfelder!: KapitalFeldId[]

  @ApiProperty({ type: DepotEinordnungDto })
  depot!: DepotEinordnungDto

  @ApiProperty({ type: [KapitalPostenDto], description: 'The Kapital-Posten (empty while not determinable).' })
  posten!: KapitalPostenDto[]

  @ApiProperty({ type: KapitalStandDto })
  stand!: KapitalStandDto
}
