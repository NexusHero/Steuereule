// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty } from '@nestjs/swagger'
import { KapitalFeldDto } from './kapital-feld.dto.js'

/** The depot-Einordnung (ticket 10.5 AC 3) — what the `kap-depot` answer MEANS for the Steuererklärung. */
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

/**
 * The derived Kapital-Posten — @steuereule/core's `kapitalAlsKernposten` as a flat wire shape.
 * `herkunft` carries the Quelle art (`eingabe` — the guided mask is a manual transcription;
 * the Beleg-/KI-Vorschlag-Herkunft is the Zuordnungs-Slice's work). Empty while the field is
 * not determinable (never a fabricated zero, ADR-032).
 */
export class KapitalPostenDto {
  @ApiProperty({ type: String, example: 'kapital', description: 'The stable posten id.' })
  id!: string

  @ApiProperty({ type: Number, example: 2500, description: 'The Kapitalerträge (whole euros).' })
  betrag!: number

  @ApiProperty({ type: String, example: 'eingabe', description: 'The Herkunft (Quelle art) of the amount.' })
  herkunft!: string
}

/** The derived fold result — @steuereule/core's `Berechnungsstand` as a flat wire shape. */
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

/**
 * The response shape for `GET /v1/steuerjahre/{jahr}/kapital` and `PUT .../kapital/kapitalertraege`:
 * the field state, the depot-Einordnung (derived from the persisted interview answer `kap-depot`,
 * never a column of its own), the derived Kapital-Posten (with Herkunft) and the fold result.
 * Everything came from @steuereule/core, never recomputed in the API.
 */
export class KapitalResponseDto {
  @ApiProperty({ type: KapitalFeldDto })
  kapitalertraege!: KapitalFeldDto

  @ApiProperty({ type: DepotEinordnungDto })
  depot!: DepotEinordnungDto

  @ApiProperty({ type: [KapitalPostenDto], description: 'The Kapital-Posten (empty while not determinable).' })
  posten!: KapitalPostenDto[]

  @ApiProperty({ type: KapitalStandDto })
  stand!: KapitalStandDto
}
