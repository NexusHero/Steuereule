import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export class CreateKindDto {
  @ApiProperty({ type: String, example: 'Lina' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  vorname!: string

  @ApiProperty({ type: String, example: 'Muster' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  nachname!: string

  @ApiProperty({ type: String, example: '2018-05-12', description: 'ISO date YYYY-MM-DD' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  geburtsdatum!: string

  @ApiPropertyOptional({ type: String, example: '12345678901' })
  @IsOptional()
  @IsString()
  @MaxLength(11)
  idnr?: string

  @ApiPropertyOptional({ type: String, example: '3000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  kindergeldAnspruchEur?: string
}

export class UpdateKindDto {
  @ApiPropertyOptional({ type: String, example: 'Lina' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vorname?: string

  @ApiPropertyOptional({ type: String, example: 'Muster' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nachname?: string

  @ApiPropertyOptional({ type: String, example: '2018-05-12' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  geburtsdatum?: string

  @ApiPropertyOptional({ type: String, example: '12345678901' })
  @IsOptional()
  @IsString()
  @MaxLength(11)
  idnr?: string

  @ApiPropertyOptional({ type: String, example: '3000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  kindergeldAnspruchEur?: string
}

export class KindResponseDto {
  @ApiProperty({ type: String, example: 'uuid' })
  id!: string

  @ApiProperty({ type: Number, example: 1 })
  lfdNr!: number

  @ApiProperty({ type: String, example: 'Lina' })
  vorname!: string

  @ApiProperty({ type: String, example: 'Muster' })
  nachname!: string

  @ApiProperty({ type: String, example: '2018-05-12' })
  geburtsdatum!: string

  @ApiPropertyOptional({ type: String, nullable: true, example: '12345678901' })
  idnr?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '3000' })
  kindergeldAnspruchEur?: string | null
}

export class KinderResponseDto {
  @ApiProperty({ type: [KindResponseDto] })
  kinder!: KindResponseDto[]

  @ApiProperty({ type: Number, example: 1 })
  anzahl!: number

  @ApiProperty({ type: Number, example: 3000 })
  kindergeldSumme!: number

  @ApiProperty({ type: Number, example: 9540 })
  freibetragGesamt!: number
}
