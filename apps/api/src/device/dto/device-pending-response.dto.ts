import { ApiProperty } from '@nestjs/swagger'

/** `GET /v1/device/pending`'s response — the match-verification payload AC-3 needs
 *  (#238 task 2, ADR-0024): the request's *actual* browser/region/time, read fresh
 *  from `DeviceCode`, never hard-coded. `userAgent`/`region` are deliberately raw —
 *  parsing them into a friendly "Chrome on macOS" label is a rendering concern for
 *  task 3's approval screen, not this endpoint's contract. */
export class DevicePendingResponseDto {
  @ApiProperty({ type: String, example: 'K7QX-9F2M' })
  userCode!: string

  @ApiProperty({ type: String, enum: ['pending', 'approved', 'denied'], example: 'pending' })
  status!: string

  @ApiProperty({ type: String, nullable: true, description: 'The requesting desktop\'s raw User-Agent, or null if it was absent.' })
  userAgent!: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Country code from task 0b\'s geo-IP resolver, or "unknown" — never null once task 0/0b\'s write path has run.' })
  region!: string | null

  @ApiProperty({ type: String, nullable: true, format: 'date-time', description: 'When the desktop requested this code.' })
  requestedAt!: string | null
}
