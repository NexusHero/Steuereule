import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { UncertaintyDto } from '../../filing-type-comparison/dto/filing-type-comparison-response.dto.js'

/** Herkunfts-Metadaten an beiden Zahlen. */
export class MostFavourableCheckSourceDto {
  @ApiProperty({ type: Number, example: 20000, description: 'The Kapitalerträge (whole euros) — the basis of both amounts.' })
  kapitalertraege!: number

  @ApiProperty({ type: Number, example: 60000, description: 'The übrige zvE-basis (Einnahmen-Basis from @steuereule/core — layer 3 open, no real zvE yet).' })
  remainingZvE!: number

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

  @ApiPropertyOptional({ type: Number, example: 4750, description: 'Abgeltungsteuer + Soli + KiSt-Ermäßigung (only when kind !== "nicht-anwendbar").' })
  flatRateTax?: number

  @ApiPropertyOptional({ type: Number, example: 8012, description: 'The personal (tariff) tax on the capital income (only when kind !== "nicht-anwendbar").' })
  personal?: number

  @ApiPropertyOptional({ type: Number, example: 3262, description: 'persoenlich − abgeltung (only when kind !== "nicht-anwendbar").' })
  delta?: number

  @ApiPropertyOptional({ type: UncertaintyDto, description: 'The computed margin (only when kind !== "nicht-anwendbar").' })
  uncertainty?: UncertaintyDto

  @ApiPropertyOptional({ type: MostFavourableCheckSourceDto, description: 'Origin metadata on both numbers (only when kind !== "nicht-anwendbar").' })
  provenance?: MostFavourableCheckSourceDto

  @ApiPropertyOptional({
    type: String,
    enum: ['keine-abgeltung-einbehalten', 'krypto-gegated', 'kap-depot-nicht-beantwortet', 'keine-kapitalertraege'],
    description: 'Why the Günstigerprüfung does not apply (only when kind === "nicht-anwendbar").',
  })
  reason?: 'keine-abgeltung-einbehalten' | 'krypto-gegated' | 'kap-depot-nicht-beantwortet' | 'keine-kapitalertraege'
}
