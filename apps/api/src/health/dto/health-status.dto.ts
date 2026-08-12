import { ApiProperty } from '@nestjs/swagger'

export class HealthStatusDto {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status!: 'ok' | 'error'
}
