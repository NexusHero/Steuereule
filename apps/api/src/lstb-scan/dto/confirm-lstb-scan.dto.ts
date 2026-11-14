import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

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

  @ApiPropertyOptional({ type: [String], example: ['act-1', 'act-2', 'act-3'], description: 'Staged advisor actionIds fulfilled by this confirmation.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  actionIds?: string[]
}
