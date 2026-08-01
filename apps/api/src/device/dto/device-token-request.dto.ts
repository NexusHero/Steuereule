import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

/** The desktop's own poll body — just the RFC 8628 `device_code` it got from
 *  `POST /v1/device/code`. `grant_type`/`client_id` are filled in server-side
 *  (device.service.ts), never trusted from the caller. */
export class DeviceTokenRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  deviceCode!: string
}
