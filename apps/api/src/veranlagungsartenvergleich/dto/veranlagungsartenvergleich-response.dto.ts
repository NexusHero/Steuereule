import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** The margin on the wire: `kind` fixes which optional field is present. */
export class UncertaintyDto {
  @ApiProperty({ type: String, enum: ['bestimmt', 'unbestimmt'], example: 'bestimmt' })
  kind!: 'bestimmt' | 'unbestimmt'

  @ApiPropertyOptional({ type: Number, example: 0, description: 'The computed bound (only when kind === "bestimmt").' })
  upperLimit?: number

  @ApiPropertyOptional({
    type: String,
    enum: ['progressionsvorbehalt-nicht-eingegeben'],
    description: 'Why no bound exists (only when kind === "unbestimmt").',
  })
  reason?: 'progressionsvorbehalt-nicht-eingegeben'
}

/** Herkunfts-Metadaten an beiden Zahlen: die zvE-Basen und die Bestandteile. */
export class ComparisonSourceDto {
  @ApiProperty({ type: Number, example: 60000, description: 'The primary zvE-basis (Einnahmen from @steuereule/core — layer 3 open, no real zvE yet).' })
  zveA!: number

  @ApiProperty({ type: Number, example: 40000, description: 'The partner zvE-basis (query param — M1 does not yet collect it).' })
  zveB!: number

  @ApiProperty({ type: [String], example: ['einkommensteuer', 'solidaritaetszuschlag'], description: 'Which tax components are folded into both amounts.' })
  components!: string[]
}

/** The one response shape for `GET /v1/steuerjahre/{jahr}/veranlagungsartenvergleich`. */
export class FilingTypeComparisonDto {
  @ApiProperty({ type: String, enum: ['eindeutig', 'zu-knapp', 'unbestimmt', 'nicht-anwendbar'], example: 'eindeutig' })
  kind!: 'eindeutig' | 'zu-knapp' | 'unbestimmt' | 'nicht-anwendbar'

  @ApiPropertyOptional({ type: String, enum: ['einzel', 'zusammen'], description: 'The recommendation (only when kind === "eindeutig").' })
  recommendation?: 'einzel' | 'zusammen'

  @ApiPropertyOptional({ type: Number, example: 21442, description: 'Full assessed tax, single filing (only when kind !== "nicht-anwendbar").' })
  single?: number

  @ApiPropertyOptional({ type: Number, example: 21096, description: 'Full assessed tax, joint filing (only when kind !== "nicht-anwendbar").' })
  joint?: number

  @ApiPropertyOptional({ type: Number, example: -346, description: 'zusammen − einzel (only when kind !== "nicht-anwendbar").' })
  delta?: number

  @ApiPropertyOptional({ type: UncertaintyDto, description: 'The computed margin (only when kind !== "nicht-anwendbar").' })
  uncertainty?: UncertaintyDto

  @ApiPropertyOptional({ type: ComparisonSourceDto, description: 'Origin metadata on both numbers (only when kind !== "nicht-anwendbar").' })
  provenance?: ComparisonSourceDto

  @ApiPropertyOptional({ type: String, enum: ['nicht-verheiratet', 'keine-einnahmen'], description: 'Why the comparison does not apply (only when kind === "nicht-anwendbar").' })
  reason?: 'nicht-verheiratet' | 'keine-einnahmen'
}
