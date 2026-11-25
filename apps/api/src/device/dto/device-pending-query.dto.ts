import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class DevicePendingQueryDto {
  @ApiProperty({ type: String, example: 'K7QX-9F2M' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  userCode!: string
}
