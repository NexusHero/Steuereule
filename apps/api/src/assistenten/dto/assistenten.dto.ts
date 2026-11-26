import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class ConnectedAssistantDto {
  @ApiProperty({ type: String, example: 'client_xyz123' })
  clientId!: string

  @ApiProperty({ type: String, example: 'Claude Desktop' })
  name!: string

  @ApiProperty({ type: String, example: '2026-11-03T18:00:00.000Z' })
  linkedSince!: string

  @ApiPropertyOptional({ type: String, example: '2026-11-03T19:30:00.000Z', nullable: true, description: 'The newest tool call of this assistant (audit log), or the newest token issued to it.' })
  lastUsed!: string | null

  @ApiProperty({ type: [String], example: ['steuerdaten:read', 'steuerdaten:write'], description: 'The scopes the user granted.' })
  scopes!: string[]

  @ApiProperty({ type: [String], example: ['claude.ai'], description: 'Where its access goes: the hosts (or "localhost", an app scheme) of its registered redirect addresses.' })
  destinations!: string[]
}

export class OauthRedirectTargetDto {
  @ApiProperty({ type: String, example: 'https://claude.ai/api/mcp/auth_callback', description: 'A redirect address the client registered.' })
  uri!: string

  @ApiProperty({
    type: String,
    example: 'claude.ai',
    description: 'Where that address leads, for the consent screen: the host of a web address, "localhost" for an app on the user\'s machine, or an app scheme such as "cursor://".',
  })
  destination!: string
}

export class OauthClientInfoQueryDto {
  @ApiProperty({ type: String, example: 'client_xyz', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientId!: string
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

  @ApiProperty({
    type: [OauthRedirectTargetDto],
    description: 'Where an approval can send the access to. The name above is the client\'s own claim; these addresses are what it registered.',
  })
  redirectTargets!: OauthRedirectTargetDto[]
}

export class RevokeAssistantResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean
}
