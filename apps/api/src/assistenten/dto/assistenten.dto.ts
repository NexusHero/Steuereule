import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ConnectedAssistantDto {
  @ApiProperty({ type: String, example: 'client_xyz123' })
  clientId!: string

  @ApiProperty({ type: String, example: 'Claude Desktop' })
  name!: string

  @ApiProperty({ type: String, example: '2026-11-03T18:00:00.000Z' })
  linkedSince!: string

  @ApiPropertyOptional({ type: String, example: '2026-11-03T19:30:00.000Z', nullable: true })
  lastUsed!: string | null
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

export class RevokeAssistantResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean
}
