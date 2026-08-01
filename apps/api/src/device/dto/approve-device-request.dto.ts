// `type:` given explicitly — see PutProfileDto's header comment for why design:type
// metadata can't be relied on under esbuild/tsx + Vitest/SWC.
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

/** One tap — approving is the whole action (NexusHero dropped the session-scope
 *  choice; no `scope` field travels with this request, no `grantScope` column). */
export class ApproveDeviceRequestDto {
  @ApiProperty({ type: String, example: 'K7QX-9F2M' })
  @IsString()
  @IsNotEmpty()
  userCode!: string
}
