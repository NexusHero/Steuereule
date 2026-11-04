import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

/** One tap — approving is the whole action. */
export class ApproveDeviceRequestDto {
  @ApiProperty({ type: String, example: 'K7QX-9F2M' })
  @IsString()
  @IsNotEmpty()
  userCode!: string
}
