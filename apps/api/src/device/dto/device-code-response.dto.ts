// `type:` given explicitly on every @ApiProperty() — esbuild/tsx (dev+prod) and
// Vitest/SWC-under-test both need it; see PutProfileDto's header comment for why
// design:type metadata can't be relied on here.
import { ApiProperty } from '@nestjs/swagger'

/** The response shape for `POST /v1/device/code` (#238, RFC 8628 §3.2, ADR-0024) —
 *  our own camelCase mirror of the plugin's snake_case wire shape, matching this
 *  app's existing DTO convention (see ProfileResponseDto). */
export class DeviceCodeResponseDto {
  @ApiProperty({ type: String, example: 'K7QX-9F2M', description: 'The short code shown on the desktop and matched on the phone.' })
  userCode!: string

  @ApiProperty({
    type: String,
    description:
      'The RFC 8628 device_code — held by the desktop only, to poll POST /v1/device/token. Not a session credential; carries no authenticated power on its own.',
  })
  deviceCode!: string

  @ApiProperty({ type: String, description: 'The full verification URL to encode as the QR code (includes the user_code as a query param).' })
  verificationUriComplete!: string

  @ApiProperty({ type: Number, description: 'Seconds until this code expires (ADR-0024: 2 minutes).' })
  expiresIn!: number

  @ApiProperty({ type: Number, description: 'Minimum seconds between POST /v1/device/token polls.' })
  interval!: number
}
