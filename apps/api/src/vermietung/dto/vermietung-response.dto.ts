// `type:` given explicitly — see PutProfileDto's comment for why.
import { ApiProperty } from '@nestjs/swagger'
import { VermietungFeldDto } from './vermietung-feld.dto.js'

/** The Vermietung-Einordnung (ticket 10.6 AC 3) — what the `vermietung-art` answer MEANS for 1.0. */
export class VermietungEinordnungDto {
  @ApiProperty({
    type: String,
    enum: ['einfach', 'mehrere', 'verkauf-oder-moebliert', 'unbekannt'],
    example: 'einfach',
    description:
      'einfach/mehrere = ganzjährig vermietete Objekte, je Objekt eine Anlage V (computable); ' +
      'verkauf-oder-moebliert = gated in 1.0 (ADR-033); unbekannt = vermietung-art not answered.',
  })
  kind!: 'einfach' | 'mehrere' | 'verkauf-oder-moebliert' | 'unbekannt'
}

/** The computed lineare AfA with its § 7 Abs. 4 Herkunft. */
export class VermietungAfADto {
  @ApiProperty({ type: Number, example: 4000, description: 'Anschaffungskosten × AfA-Satz, rounded to whole euros.' })
  betrag!: number

  @ApiProperty({ type: String, example: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990', description: 'The statutory citation that produced the percentage.' })
  herkunft!: string
}

/** One object's derived facts — @steuereule/core's `vermietungsobjektFakten` as a wire shape. */
export class VermietungsobjektFaktenDto {
  @ApiProperty({ type: Number, nullable: true, example: 12000, description: 'The captured Mieteinnahmen, or null while open.' })
  einnahmen!: number | null

  @ApiProperty({ type: Number, nullable: true, example: 1500, description: 'The captured Werbungskosten (0 = the user entered 0), or null while open.' })
  werbungskosten!: number | null

  @ApiProperty({ type: VermietungAfADto, nullable: true, description: 'The computed lineare AfA with its § 7 Abs. 4 Herkunft, or null while open.' })
  afa!: VermietungAfADto | null

  @ApiProperty({ type: Number, example: 0, description: 'The blocked results of this object (Mieteinnahmen/AfA/Werbungskosten — max 3).' })
  offenePosten!: number
}

/** ONE Vermietungsobjekt: the four field states plus its derived facts. */
export class VermietungsobjektDto {
  @ApiProperty({ type: String, example: '9c3f…', description: 'The stable object id (assigned by the API on create).' })
  id!: string

  @ApiProperty({ type: VermietungFeldDto })
  mieteinnahmen!: VermietungFeldDto

  @ApiProperty({ type: VermietungFeldDto })
  anschaffungskosten!: VermietungFeldDto

  @ApiProperty({ type: VermietungFeldDto })
  baujahr!: VermietungFeldDto

  @ApiProperty({ type: VermietungFeldDto })
  werbungskosten!: VermietungFeldDto

  @ApiProperty({ type: VermietungsobjektFaktenDto })
  fakten!: VermietungsobjektFaktenDto
}

/** The derived fold over ALL objects — @steuereule/core's `VermietungStand` as a flat wire shape. */
export class VermietungStandDto {
  @ApiProperty({ enum: ['bestimmt', 'offen'], description: 'Determined, or open (naming what blocks).' })
  kind!: 'bestimmt' | 'offen'

  @ApiProperty({ type: Number, description: 'Sum of the Mieteinnahmen Einnahme-Posten (whole euros).' })
  einnahmen!: number

  @ApiProperty({ type: Number, description: 'Sum of Vorsorgeaufwand Posten (whole euros).' })
  vorsorgeaufwand!: number

  @ApiProperty({ type: Number, description: 'Sum of Anrechnung Posten (whole euros).' })
  anrechnung!: number

  @ApiProperty({ type: Number, description: 'Sum of CAPTURED Werbungskosten — reported, never subtracted (partial truth as a partial truth).' })
  werbungskosten!: number

  @ApiProperty({ type: Number, description: 'Sum of the computed lineare AfA.' })
  afa!: number

  @ApiProperty({ type: Number, description: 'Required-but-empty results across all objects.' })
  offenePosten!: number

  @ApiProperty({ type: Number, description: 'Open conflicts (always 0 this slice).' })
  konflikte!: number

  @ApiProperty({ type: [String], required: false, description: 'Gated Einkunftsarten (only when offen).' })
  gegated?: string[]
}

/**
 * The response shape for `GET /v1/steuerjahre/{jahr}/vermietung`, `POST …/vermietung/objekte`
 * and every PUT: the Einordnung (derived from the persisted interview answer `vermietung-art`,
 * never a column of its own), the objects (field states + derived facts) and the fold.
 * Everything came from @steuereule/core, never recomputed in the API.
 */
export class VermietungResponseDto {
  @ApiProperty({ type: VermietungEinordnungDto })
  einordnung!: VermietungEinordnungDto

  @ApiProperty({ type: [VermietungsobjektDto], description: 'The objects, oldest first.' })
  objekte!: VermietungsobjektDto[]

  @ApiProperty({ type: VermietungStandDto })
  stand!: VermietungStandDto
}
