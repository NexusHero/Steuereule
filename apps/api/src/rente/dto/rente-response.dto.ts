import { ApiProperty } from '@nestjs/swagger'
import { RenteFeldDto } from './rente-feld.dto.js'

/** The derived taxable Posten. */
export class RentePostenDto {
  @ApiProperty({ type: String, example: 'rente', description: 'The stable posten id.' })
  id!: string

  @ApiProperty({ type: Number, example: 16000, description: 'The taxable share (whole euros).' })
  betrag!: number

  @ApiProperty({ type: String, description: 'The § 22 Nr. 1 Satz 3 EStG rule citation (Herkunft).' })
  herkunft!: string
}

/** The derived fold result. */
export class RenteStandDto {
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

/** The response shape for `GET /v1/steuerjahre/{jahr}/rente` and every PUT. */
export class RenteResponseDto {
  @ApiProperty({
    type: String,
    enum: ['GesetzlicheRente', 'Betriebsrente', 'PrivateRentenversicherung', 'WitwenWaisenrente', 'AuslaendischeRente'],
    nullable: true,
    description: 'The chosen Rentenart (product ADR-036 §3), null when not yet chosen.',
  })
  art!: string | null

  @ApiProperty({ type: RenteFeldDto })
  jahresbetrag!: RenteFeldDto

  @ApiProperty({ type: RenteFeldDto })
  rentenbeginnJahr!: RenteFeldDto

  @ApiProperty({ type: RenteFeldDto })
  alterBeiRentenbeginn!: RenteFeldDto

  @ApiProperty({ type: [RentePostenDto], description: 'The taxable posten (empty while not determinable).' })
  posten!: RentePostenDto[]

  @ApiProperty({ type: RenteStandDto })
  stand!: RenteStandDto
}
