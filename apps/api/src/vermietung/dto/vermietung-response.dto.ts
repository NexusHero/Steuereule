import { ApiProperty } from '@nestjs/swagger'
import { RentalFieldDto } from './vermietung-feld.dto.js'

/** The Vermietung-Einordnung — what the `vermietung-art` answer MEANS for 1.0. */
export class RentalClassificationDto {
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
export class RentalDepreciationDto {
  @ApiProperty({ type: Number, example: 4000, description: 'Anschaffungskosten × AfA-Satz, rounded to whole euros.' })
  amount!: number

  @ApiProperty({ type: String, example: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990', description: 'The statutory citation that produced the percentage.' })
  provenance!: string
}

/** One object's derived facts. */
export class RentalPropertyFactsDto {
  @ApiProperty({ type: Number, nullable: true, example: 12000, description: 'The captured Mieteinnahmen, or null while open.' })
  einnahmen!: number | null

  @ApiProperty({ type: Number, nullable: true, example: 1500, description: 'The captured Werbungskosten (0 = the user entered 0), or null while open.' })
  werbungskosten!: number | null

  @ApiProperty({ type: RentalDepreciationDto, nullable: true, description: 'The computed lineare AfA with its § 7 Abs. 4 Herkunft, or null while open.' })
  depreciation!: RentalDepreciationDto | null

  @ApiProperty({ type: Number, example: 0, description: 'The blocked results of this object (Mieteinnahmen/AfA/Werbungskosten — max 3).' })
  openItems!: number
}

/** ONE Vermietungsobjekt: the four field states plus its derived facts. */
export class RentalPropertyDto {
  @ApiProperty({ type: String, example: '9c3f…', description: 'The stable object id (assigned by the API on create).' })
  id!: string

  @ApiProperty({ type: RentalFieldDto })
  mieteinnahmen!: RentalFieldDto

  @ApiProperty({ type: RentalFieldDto })
  anschaffungskosten!: RentalFieldDto

  @ApiProperty({ type: RentalFieldDto })
  baujahr!: RentalFieldDto

  @ApiProperty({ type: RentalFieldDto })
  werbungskosten!: RentalFieldDto

  @ApiProperty({ type: String, nullable: true })
  strasse?: string | null

  @ApiProperty({ type: String, nullable: true })
  hausnummer?: string | null

  @ApiProperty({ type: String, nullable: true })
  plz?: string | null

  @ApiProperty({ type: String, nullable: true })
  ort?: string | null

  @ApiProperty({ type: String, nullable: true })
  wohnflaeche?: string | null

  @ApiProperty({ type: Boolean, nullable: true })
  afaWieVorjahr?: boolean | null

  @ApiProperty({ type: String, nullable: true })
  umlagen?: string | null

  @ApiProperty({ type: String, nullable: true })
  schuldzinsen?: string | null

  @ApiProperty({ type: String, nullable: true })
  einheiten?: string | null

  @ApiProperty({ type: String, nullable: true })
  anteilA?: string | null

  @ApiProperty({ type: RentalPropertyFactsDto })
  facts!: RentalPropertyFactsDto
}

/** The derived fold over ALL objects. */
export class RentalStatusDto {
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
  depreciation!: number

  @ApiProperty({ type: Number, description: 'Required-but-empty results across all objects.' })
  openItems!: number

  @ApiProperty({ type: Number, description: 'Open conflicts (always 0 this slice).' })
  conflicts!: number

  @ApiProperty({ type: [String], required: false, description: 'Gated Einkunftsarten (only when offen).' })
  gated?: string[]
}

/** The response shape for `GET /v1/steuerjahre/{jahr}/vermietung`, `POST …/vermietung/objekte` and every PUT. */
export class RentalResponseDto {
  @ApiProperty({ type: RentalClassificationDto })
  classification!: RentalClassificationDto

  @ApiProperty({ type: [RentalPropertyDto], description: 'The objects, oldest first.' })
  properties!: RentalPropertyDto[]

  @ApiProperty({ type: RentalStatusDto })
  status!: RentalStatusDto
}
