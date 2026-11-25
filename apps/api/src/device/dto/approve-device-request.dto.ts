import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

/** One tap — approving is the whole action. */
export class ApproveDeviceRequestDto {
  @ApiProperty({ type: String, example: 'K7QX-9F2M' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  userCode!: string
}
