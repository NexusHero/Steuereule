import { ApiProperty } from '@nestjs/swagger'
import { PensionFieldDto } from './rente-feld.dto.js'

/** The derived taxable Posten. */
export class PensionItemDto {
  @ApiProperty({ type: String, example: 'rente', description: 'The stable posten id.' })
  id!: string

  @ApiProperty({ type: Number, example: 16000, description: 'The taxable share (whole euros).' })
  amount!: number

  @ApiProperty({ type: String, description: 'The § 22 Nr. 1 Satz 3 EStG rule citation (Herkunft).' })
  provenance!: string
}

/** The derived fold result. */
export class PensionStatusDto {
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

/** The response shape for `GET /v1/steuerjahre/{jahr}/rente` and every PUT. */
export class PensionResponseDto {
  @ApiProperty({
    type: String,
    enum: ['GesetzlicheRente', 'Betriebsrente', 'PrivateRentenversicherung', 'WitwenWaisenrente', 'AuslaendischeRente'],
    nullable: true,
    description: 'The chosen Rentenart (product ADR-036 §3), null when not yet chosen.',
  })
  art!: string | null

  @ApiProperty({ type: PensionFieldDto })
  jahresbetrag!: PensionFieldDto

  @ApiProperty({ type: PensionFieldDto })
  rentenbeginnJahr!: PensionFieldDto

  @ApiProperty({ type: PensionFieldDto })
  alterBeiRentenbeginn!: PensionFieldDto

  @ApiProperty({ type: [PensionItemDto], description: 'The taxable posten (empty while not determinable).' })
  items!: PensionItemDto[]

  @ApiProperty({ type: PensionStatusDto })
  status!: PensionStatusDto
}
