import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class DevicePendingQueryDto {
  @ApiProperty({ type: String, example: 'K7QX-9F2M' })
  @IsString()
  @IsNotEmpty()
  userCode!: string
}
