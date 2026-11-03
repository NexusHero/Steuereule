import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ANDERE_KINDSCHAFTSVERHAELTNISSE, ANDERER_ELTERNTEIL_STATUS, KINDSCHAFTSVERHAELTNISSE } from '@steuereule/core'
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** The Anlage-Kind facts beyond the child's identity (Zeilen 7, 8, 10) — optional on write. */
class KindAngabenDto {
  @ApiPropertyOptional({ enum: KINDSCHAFTSVERHAELTNISSE, nullable: true, description: 'Kz 02: 1 = leiblich/adoptiert, 2 = Pflegekind, 3 = Enkel-/Stiefkind' })
  @IsOptional()
  @IsIn(KINDSCHAFTSVERHAELTNISSE)
  kindschaftsverhaeltnis?: string | null

  @ApiPropertyOptional({ enum: KINDSCHAFTSVERHAELTNISSE, nullable: true, description: 'Kz 03, to the spouse — only for a joint return' })
  @IsOptional()
  @IsIn(KINDSCHAFTSVERHAELTNISSE)
  kindschaftsverhaeltnisB?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Familienkasse Sachsen' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  familienkasse?: string | null

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'The child lived in Germany all year (Zeile 8).' })
  @IsOptional()
  @IsBoolean()
  wohnsitzInlandGanzjaehrig?: boolean | null

  @ApiPropertyOptional({ enum: ANDERER_ELTERNTEIL_STATUS, nullable: true, description: 'The other parent outside this return (Zeilen 11–15).' })
  @IsOptional()
  @IsIn(ANDERER_ELTERNTEIL_STATUS)
  andererElternteil?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Muster, Max' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  andererElternteilName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '1984-02-11' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  andererElternteilGeburtsdatum?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Hauptstraße 3, 01067 Dresden' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  andererElternteilAdresse?: string | null

  @ApiPropertyOptional({ enum: ANDERE_KINDSCHAFTSVERHAELTNISSE, nullable: true })
  @IsOptional()
  @IsIn(ANDERE_KINDSCHAFTSVERHAELTNISSE)
  andererElternteilArt?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '2025-06-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  andererElternteilVerstorbenAm?: string | null

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'Zeile 45: the child was registered with the filer all year.' })
  @IsOptional()
  @IsBoolean()
  gemeldetBeiMirGanzjaehrig?: boolean | null

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'Zeile 46: the Kindergeld was paid to the filer all year.' })
  @IsOptional()
  @IsBoolean()
  kindergeldAnMichGanzjaehrig?: boolean | null
}

export class CreateKindDto extends KindAngabenDto {
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

export class UpdateKindDto extends KindAngabenDto {
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

  @ApiProperty({ enum: KINDSCHAFTSVERHAELTNISSE, nullable: true })
  kindschaftsverhaeltnis!: string | null

  @ApiProperty({ enum: KINDSCHAFTSVERHAELTNISSE, nullable: true })
  kindschaftsverhaeltnisB!: string | null

  @ApiProperty({ type: String, nullable: true })
  familienkasse!: string | null

  @ApiProperty({ type: Boolean, nullable: true })
  wohnsitzInlandGanzjaehrig!: boolean | null

  @ApiProperty({ enum: ANDERER_ELTERNTEIL_STATUS, nullable: true })
  andererElternteil!: string | null

  @ApiProperty({ type: String, nullable: true })
  andererElternteilName!: string | null

  @ApiProperty({ type: String, nullable: true })
  andererElternteilGeburtsdatum!: string | null

  @ApiProperty({ type: String, nullable: true })
  andererElternteilAdresse!: string | null

  @ApiProperty({ enum: ANDERE_KINDSCHAFTSVERHAELTNISSE, nullable: true })
  andererElternteilArt!: string | null

  @ApiProperty({ type: String, nullable: true })
  andererElternteilVerstorbenAm!: string | null

  @ApiProperty({ type: Boolean, nullable: true })
  gemeldetBeiMirGanzjaehrig!: boolean | null

  @ApiProperty({ type: Boolean, nullable: true })
  kindergeldAnMichGanzjaehrig!: boolean | null
}

export class KinderResponseDto {
  @ApiProperty({ type: [KindResponseDto] })
  kinder!: KindResponseDto[]

  @ApiProperty({ type: Number, example: 1 })
  anzahl!: number

  @ApiProperty({ type: Number, example: 3000 })
  kindergeldSumme!: number

  @ApiProperty({ type: Number, example: 9600 })
  freibetragGesamt!: number
}
