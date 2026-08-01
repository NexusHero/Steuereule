import { ApiProperty } from '@nestjs/swagger'

/** Shared `{ success: true }` acknowledgement — `/v1/device/approve` and
 *  `/v1/device/token` deliberately return no session/token material in the body
 *  (#238, ADR-0008/0012): `/v1/device/token`'s actual auth state travels via the
 *  httpOnly `Set-Cookie` it also sets, never JS-readable JSON. */
export class AckResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean
}
