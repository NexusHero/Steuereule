import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { UncertaintyDto } from '../../filing-type-comparison/dto/filing-type-comparison-response.dto.js'

/** Herkunfts-Metadaten an beiden Zahlen. */
export class MostFavourableCheckSourceDto {
  @ApiProperty({ type: Number, example: 20000, description: 'The Kapitalerträge (whole euros) — the basis of both amounts.' })
  kapitalertraege!: number

  @ApiProperty({ type: Number, example: 60000, description: 'The taxable income of the Cockpit estimate without the capital income (the upper end of its range).' })
  remainingZvE!: number

  @ApiPropertyOptional({ type: Number, example: 59000, description: 'The lower end of the estimate’s taxable income; the figures are those of the upper end.' })
  remainingZvEFrom?: number

  @ApiProperty({ type: Number, example: 1000, description: 'The applied Sparerpauschbetrag (§ 20 Abs. 9 EStG).' })
  saversAllowance!: number

  @ApiProperty({ type: String, enum: ['einzel', 'zusammen'], description: 'Which Veranlagungsart both amounts compute.' })
  assessmentType!: 'einzel' | 'zusammen'

  @ApiProperty({ type: [String], example: ['einkommensteuer', 'solidaritaetszuschlag'], description: 'Which tax components are folded into both amounts.' })
  components!: string[]
}

/** The one response shape for `GET /v1/steuerjahre/{jahr}/kapital/guenstigerpruefung`. */
export class MostFavourableCheckDto {
  @ApiProperty({ type: String, enum: ['eindeutig', 'zu-knapp', 'unbestimmt', 'nicht-anwendbar'], example: 'eindeutig' })
  kind!: 'eindeutig' | 'zu-knapp' | 'unbestimmt' | 'nicht-anwendbar'

  @ApiPropertyOptional({ type: String, enum: ['abgeltung', 'persoenlich'], description: 'The recommendation (only when kind === "eindeutig").' })
  recommendation?: 'abgeltung' | 'persoenlich'

  @ApiPropertyOptional({ type: Number, example: 5011.25, description: 'Abgeltungsteuer + Soli (5,5 % without exemption limit) + KiSt, in euros with cents (only when kind !== "nicht-anwendbar").' })
  flatRateTax?: number

  @ApiPropertyOptional({ type: Number, example: 8012, description: 'The tariff tax the capital income adds to the estimate (tariff with minus tariff without, plus Soli and KiSt; only when kind !== "nicht-anwendbar").' })
  personal?: number

  @ApiPropertyOptional({ type: Number, example: 3262, description: 'persoenlich − abgeltung (only when kind !== "nicht-anwendbar").' })
  delta?: number

  @ApiPropertyOptional({ type: UncertaintyDto, description: 'The computed margin (only when kind !== "nicht-anwendbar").' })
  uncertainty?: UncertaintyDto

  @ApiPropertyOptional({ type: MostFavourableCheckSourceDto, description: 'Origin metadata on both numbers (only when kind !== "nicht-anwendbar").' })
  provenance?: MostFavourableCheckSourceDto

  @ApiPropertyOptional({
    type: String,
    enum: ['keine-abgeltung-einbehalten', 'krypto-gegated', 'kap-depot-nicht-beantwortet', 'keine-kapitalertraege', 'schaetzung-offen', 'schaetzung-nicht-moeglich'],
    description: 'Why the Günstigerprüfung does not apply (only when kind === "nicht-anwendbar").',
  })
  reason?: 'keine-abgeltung-einbehalten' | 'krypto-gegated' | 'kap-depot-nicht-beantwortet' | 'keine-kapitalertraege' | 'schaetzung-offen' | 'schaetzung-nicht-moeglich'

  @ApiPropertyOptional({ type: [String], example: ['lohnsteuer'], description: 'What the Cockpit estimate still lacks, as its own missing list (only when reason === "schaetzung-offen").' })
  missing?: string[]

  @ApiPropertyOptional({ type: String, example: 'besondere-lebenslage', description: 'Why the Cockpit estimate cannot be computed (only when reason === "schaetzung-nicht-moeglich").' })
  estimateReason?: string

  @ApiPropertyOptional({
    type: String,
    enum: ['abgeltung', 'quelle'],
    description:
      'How the Cockpit estimate counts the capital income (only when kind !== "nicht-anwendbar"): "abgeltung" = at the flat rate in the joint estimate, "quelle" = left with the flat tax withheld at source. It never applies the cheaper tariff itself.',
  })
  estimateTreatment?: 'abgeltung' | 'quelle'
}
