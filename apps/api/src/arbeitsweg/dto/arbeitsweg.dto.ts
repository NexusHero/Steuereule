import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { VERKEHRSMITTEL, type Verkehrsmittel } from '../arbeitsweg.repository.js'

export class ArbeitswegEingabenDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5], description: 'ISO weekdays worked (1 = Monday … 7 = Sunday).' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  arbeitstage!: readonly (1 | 2 | 3 | 4 | 5 | 6 | 7)[]

  @ApiProperty({ type: Number, example: 30 })
  @IsInt()
  @Min(0)
  @Max(366)
  urlaubstage!: number

  @ApiProperty({ type: Number, example: 5 })
  @IsInt()
  @Min(0)
  @Max(366)
  krankheitstage!: number

  @ApiProperty({ type: Number, example: 20 })
  @IsInt()
  @Min(0)
  @Max(366)
  homeofficeTage!: number

  @ApiProperty({ type: Number, nullable: true, example: 23, description: 'One-way distance in full kilometres.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  einfacheKm!: number | null

  @ApiProperty({ type: String, enum: VERKEHRSMITTEL, nullable: true, example: 'pkw' })
  @IsOptional()
  @IsIn(VERKEHRSMITTEL)
  verkehrsmittel!: Verkehrsmittel | null

  @ApiProperty({ type: String, nullable: true, example: '79539 Lörrach, Hauptstraße 1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taetigkeitsstaette!: string | null
}

export class WerktageDto {
  @ApiProperty({ type: Number }) wochentage!: number
  @ApiProperty({ type: Number }) werktage!: number
  @ApiProperty({ type: Number }) pendlertage!: number
}

export class ArbeitswegResponseDto {
  @ApiProperty({ type: () => ArbeitswegEingabenDto, nullable: true })
  eingaben!: ArbeitswegEingabenDto | null

  @ApiProperty({ type: () => WerktageDto, nullable: true })
  werktage!: WerktageDto | null

  @ApiProperty({ type: Number, nullable: true, description: 'Entfernungspauschale in whole euros; null until distance and means of travel are known.' })
  pendlerpauschale!: number | null
}
