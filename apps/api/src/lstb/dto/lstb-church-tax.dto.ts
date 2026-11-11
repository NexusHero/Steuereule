import { ApiProperty } from '@nestjs/swagger'

/** Church tax withheld per LStB (Zeilen 6 und 7, ADR-0063). Both optional: null = not entered. */
export class LstbChurchTaxDto {
  @ApiProperty({ type: Number, nullable: true, example: 540, description: 'Zeile 6: einbehaltene Kirchensteuer des Arbeitnehmers, ganze Euro.' })
  kirchensteuer!: number | null

  @ApiProperty({ type: Number, nullable: true, example: null, description: 'Zeile 7: Kirchensteuer des Ehegatten (nur konfessionsverschiedene Ehe), ganze Euro.' })
  kirchensteuerEhegatte!: number | null
}
