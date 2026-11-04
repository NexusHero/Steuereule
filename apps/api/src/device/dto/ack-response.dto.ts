import { ApiProperty } from '@nestjs/swagger'

export class AckResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean
}
