import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator'

const line = (example: number, description: string) => ({ type: Number, example, description: `${description} Ganze Euro; weggelassen = nicht gelesen, bleibt wie es ist.` })

/** The further lines of a scanned LStB the user confirmed (ADR-0093): one per field of the mask. */
export class ConfirmLstbScanLinesDto {
  @ApiPropertyOptional({ type: Number, example: 12.34, description: 'Zeile 5: Solidaritätszuschlag, Euro mit Cent.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  solidaritaetszuschlag?: number

  @ApiPropertyOptional(line(576, 'Zeile 6: Kirchensteuer.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  kirchensteuer?: number

  @ApiPropertyOptional(line(121, 'Zeile 7: Kirchensteuer des Ehegatten/Lebenspartners.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  kirchensteuerEhegatte?: number

  @ApiPropertyOptional(line(4474, 'Zeile 22 a/b: Arbeitgeberanteil zur Rentenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  rvArbeitgeber?: number

  @ApiPropertyOptional(line(4464, 'Zeile 23 a/b: Arbeitnehmeranteil zur Rentenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  rvArbeitnehmer?: number

  @ApiPropertyOptional(line(2251, 'Zeile 24 a–c: steuerfreie Arbeitgeberzuschüsse zur Kranken- und Pflegeversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  zuschuesseKvPv?: number

  @ApiPropertyOptional(line(451, 'Zeile 24c: Pflegeversicherungs-Teil des Zuschusses.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  zuschussPv?: number

  @ApiPropertyOptional(line(3651, 'Zeile 25: Krankenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  kvArbeitnehmer?: number

  @ApiPropertyOptional(line(816, 'Zeile 26: Pflegeversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  pvArbeitnehmer?: number

  @ApiPropertyOptional(line(624, 'Zeile 27: Arbeitslosenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  avArbeitnehmer?: number
}

/** Atomic batch confirmation DTO for pre-filled LStB scan values with explicit receipt provenance (#444). */
export class ConfirmLstbScanDto {
  @ApiProperty({ type: Number, example: 54320, description: 'Bruttoarbeitslohn (Zeile 3) in whole EUR.' })
  @IsInt()
  @Min(0)
  bruttoarbeitslohn!: number

  @ApiProperty({ type: Number, example: 9840, description: 'Einbehaltene Lohnsteuer (Zeile 4) in whole EUR.' })
  @IsInt()
  @Min(0)
  lohnsteuer!: number

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 10912,
    description:
      'SV-Arbeitnehmeranteil (Summe Zeilen 23/23a/23b, 25, 26 und 27) in whole EUR. Absent or null when unreadable: the field stays open, or on a further certificate the recorded sum stands (ADR-0083).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sozialversicherung?: number | null

  @ApiPropertyOptional({ type: String, example: 'beleg-123', description: 'Optional receipt id for { kind: "beleg", receiptId } provenance.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiptId?: string

  @ApiPropertyOptional({ type: Boolean, example: false, description: 'Must be true to overwrite already captured LStB fields (ADR-0008).' })
  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean

  @ApiPropertyOptional({ type: Boolean, example: false, description: 'Adds the values to a certificate already captured for the year (second employer, later payment) instead of replacing it. The same certificate twice is refused (409 LSTB_SAME_CERTIFICATE).' })
  @IsOptional()
  @IsBoolean()
  addToExisting?: boolean

  @ApiPropertyOptional({ type: ConfirmLstbScanLinesDto, description: 'The further lines read and confirmed with the three values; each is written to its field of the mask.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmLstbScanLinesDto)
  lines?: ConfirmLstbScanLinesDto

  @ApiPropertyOptional({ type: String, example: 'Beispielwerke GmbH', description: 'The employer as the certificate names it (ADR-0099 §8); on a further certificate one already recorded stays.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  arbeitgeber?: string

  @ApiPropertyOptional({ type: [String], example: ['act-1', 'act-2', 'act-3'], description: 'Staged advisor actionIds fulfilled by this confirmation.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  actionIds?: string[]
}
