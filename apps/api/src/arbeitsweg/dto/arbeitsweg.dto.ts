import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { MEANS_OF_TRANSPORT, type MeansOfTransport } from '../arbeitsweg.repository.js'

export class CommuteInputsDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5], description: 'ISO weekdays worked (1 = Monday … 7 = Sunday).' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workdays!: readonly (1 | 2 | 3 | 4 | 5 | 6 | 7)[]

  @ApiProperty({ type: Number, example: 30 })
  @IsInt()
  @Min(0)
  @Max(366)
  vacationDays!: number

  @ApiProperty({ type: Number, example: 5 })
  @IsInt()
  @Min(0)
  @Max(366)
  sickDays!: number

  @ApiProperty({ type: Number, example: 20 })
  @IsInt()
  @Min(0)
  @Max(366)
  homeOfficeDays!: number

  @ApiProperty({ type: Number, nullable: true, example: 23, description: 'One-way distance in full kilometres.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  oneWayKm!: number | null

  @ApiProperty({ type: String, enum: MEANS_OF_TRANSPORT, nullable: true, example: 'pkw' })
  @IsOptional()
  @IsIn(MEANS_OF_TRANSPORT)
  transport!: MeansOfTransport | null

  @ApiProperty({ type: String, nullable: true, example: '79539 Lörrach, Hauptstraße 1' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workplace!: string | null

  @ApiPropertyOptional({ type: Number, nullable: true, example: 11, description: 'Confirmed public holidays on working days, subtracted from the commute days.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  publicHolidays?: number | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'BW', description: 'German state or Swiss canton the holiday suggestion came from.' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  publicHolidayRegion?: string | null
}

export class WorkdaysDto {
  @ApiProperty({ type: Number }) weekdays!: number
  @ApiProperty({ type: Number }) workdays!: number
  @ApiProperty({ type: Number }) commuteDays!: number
}

export class CommuteResponseDto {
  @ApiProperty({ type: () => CommuteInputsDto, nullable: true })
  inputs!: CommuteInputsDto | null

  @ApiProperty({ type: () => WorkdaysDto, nullable: true })
  workdays!: WorkdaysDto | null

  @ApiProperty({ type: Number, nullable: true, description: 'Entfernungspauschale in whole euros; null until distance and means of travel are known.' })
  commuterAllowance!: number | null
}
