import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class VerbundenerAssistentDto {
  @ApiProperty({ type: String, example: 'client_xyz123' })
  clientId!: string

  @ApiProperty({ type: String, example: 'Claude Desktop' })
  name!: string

  @ApiProperty({ type: String, example: '2026-11-03T18:00:00.000Z' })
  verbundenSeit!: string

  @ApiPropertyOptional({ type: String, example: '2026-11-03T19:30:00.000Z', nullable: true })
  zuletztGenutzt!: string | null
}

export class OauthClientInfoDto {
  @ApiProperty({ type: String, example: 'client_xyz123' })
  clientId!: string

  @ApiProperty({ type: String, example: 'Claude Desktop' })
  name!: string

  @ApiPropertyOptional({ type: String, example: 'https://claude.ai', nullable: true })
  uri?: string | null

  @ApiPropertyOptional({ type: String, example: null, nullable: true })
  icon?: string | null
}

export class RevokeAssistentResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean
}
