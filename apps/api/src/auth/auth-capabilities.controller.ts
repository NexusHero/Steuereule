import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { BETTER_AUTH_BUNDLE } from './auth.tokens.js'
import type { BetterAuthBundle } from './better-auth.js'
import { AuthCapabilitiesDto } from './dto/auth-capabilities.dto.js'

/** Tells the client which sign-in methods are actually configured. */
@ApiTags('auth')
@Controller('v1/auth')
export class AuthCapabilitiesController {
  constructor(@Inject(BETTER_AUTH_BUNDLE) private readonly bundle: BetterAuthBundle) {}

  @Get('capabilities')
  @ApiOkResponse({
    description:
      'What this deployment can authenticate with. `socialProviders` is empty when none are configured; clients must then not offer social sign-in.',
    type: AuthCapabilitiesDto,
  })
  getCapabilities(): AuthCapabilitiesDto {
    return { socialProviders: [...this.bundle.enabledSocialProviders] }
  }
}
