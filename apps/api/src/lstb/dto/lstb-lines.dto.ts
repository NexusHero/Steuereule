import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'

const line = (example: number, description: string) => ({ type: Number, nullable: true, example, description: `${description} Ganze Euro; weggelassen = unverändert, null = leeren.` })

/** LStB Zeilen 22–27, 24c und 5 (ADR-0093): one field per printed line, the app adds them. */
export class LstbLinesDto {
  @ApiPropertyOptional(line(6150, 'Zeile 23 a/b: Arbeitnehmeranteil zur Rentenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  rvArbeitnehmer?: number | null

  @ApiPropertyOptional(line(6150, 'Zeile 22 a/b: Arbeitgeberanteil zur Rentenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  rvArbeitgeber?: number | null

  @ApiPropertyOptional(line(3100, 'Zeile 25: Arbeitnehmerbeitrag zur gesetzlichen Krankenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  kvArbeitnehmer?: number | null

  @ApiPropertyOptional(line(640, 'Zeile 26: Arbeitnehmerbeitrag zur sozialen Pflegeversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  pvArbeitnehmer?: number | null

  @ApiPropertyOptional(line(520, 'Zeile 27: Arbeitnehmerbeitrag zur Arbeitslosenversicherung.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  avArbeitnehmer?: number | null

  @ApiPropertyOptional(line(300, 'Zeile 24c: Pflegeversicherungs-Teil des steuerfreien Arbeitgeberzuschusses.'))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  zuschussPv?: number | null

  @ApiPropertyOptional({ type: Number, nullable: true, example: 92.31, description: 'Zeile 5: einbehaltener Solidaritätszuschlag, Euro mit Cent; weggelassen = unverändert, null = leeren.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999)
  solidaritaetszuschlag?: number | null
}

/** The stored lines, the sum the app keeps, and whether Zeile 24 still has to be answered. */
export class LstbLinesResponseDto {
  @ApiProperty({ type: Number, nullable: true }) rvArbeitnehmer!: number | null
  @ApiProperty({ type: Number, nullable: true }) rvArbeitgeber!: number | null
  @ApiProperty({ type: Number, nullable: true }) kvArbeitnehmer!: number | null
  @ApiProperty({ type: Number, nullable: true }) pvArbeitnehmer!: number | null
  @ApiProperty({ type: Number, nullable: true }) avArbeitnehmer!: number | null
  @ApiProperty({ type: Number, nullable: true }) zuschussPv!: number | null
  @ApiProperty({ type: Number, nullable: true }) solidaritaetszuschlag!: number | null

  @ApiProperty({ type: Number, nullable: true, description: 'Zeile 24 a–c zusammen, as stored through `lstb-zuschuesse`.' })
  zuschuesseKvPv!: number | null

  @ApiProperty({ type: Number, nullable: true, description: 'Sum of Zeilen 23, 25, 26 and 27 once all four are recorded; the app stores it as `sozialversicherung`.' })
  sozialversicherung!: number | null

  @ApiProperty({ type: Boolean, description: 'Zeile 25 or 26 is filled and Zeile 24 not answered yet: the social security counts as incomplete.' })
  subsidyOpen!: boolean
}
