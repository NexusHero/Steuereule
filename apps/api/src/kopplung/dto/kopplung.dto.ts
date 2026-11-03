import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

export class SetKopplungDto {
  @ApiProperty({ type: String, enum: ['einzel', 'zusammen'], example: 'zusammen' })
  @IsIn(['einzel', 'zusammen'])
  veranlagungsart!: 'einzel' | 'zusammen'

  @ApiPropertyOptional({ type: String, example: 'uuid-person-b' })
  @IsOptional()
  @IsString()
  personBUserId?: string
}

export class KopplungPersonBDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Erika' })
  @IsOptional()
  @IsString()
  firstName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Muster' })
  @IsOptional()
  @IsString()
  lastName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '12345678901' })
  @IsOptional()
  @IsString()
  steuerId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '1985-04-12' })
  @IsOptional()
  @IsString()
  geburtsdatum?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'ev' })
  @IsOptional()
  @IsString()
  religion?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Angestellte' })
  @IsOptional()
  @IsString()
  beruf?: string | null
}

export class KopplungResponseDto {
  @ApiProperty({ type: String, enum: ['keine', 'einzel', 'zusammen'], example: 'zusammen' })
  veranlagungsart!: 'keine' | 'einzel' | 'zusammen'

  @ApiPropertyOptional({ type: String, nullable: true, example: 'person-b-user-id' })
  personBUserId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, example: 'ABCDEF' })
  einladungsCode?: string | null

  @ApiPropertyOptional({ type: KopplungPersonBDto, nullable: true })
  personB?: KopplungPersonBDto | null
}
