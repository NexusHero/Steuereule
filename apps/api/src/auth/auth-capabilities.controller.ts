import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { BETTER_AUTH_BUNDLE } from './auth.tokens.js'
import type { BetterAuthBundle } from './better-auth.js'
import { AuthCapabilitiesDto } from './dto/auth-capabilities.dto.js'

/**
 * The capability probe behind REQ-008's honest-affordance rule.
 *
 * Social sign-in only works where the operator configured the provider's credentials; a
 * deployment without them (local dev, CI, a fresh server, staging before setup) would
 * otherwise render a Google button whose every press ends in "provider not found". The
 * client can't know that on its own — the credentials are server-side by definition — so
 * the server states it here and the client hides what it cannot honour.
 *
 * Deliberately **unauthenticated**: the login screen needs this answer before any session
 * exists. That is safe because the response is a list of capability names — the same fact
 * an anonymous visitor would learn by pressing the button once.
 */
@ApiTags('auth')
@Controller('v1/auth')
export class AuthCapabilitiesController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(BETTER_AUTH_BUNDLE) private readonly bundle: BetterAuthBundle) {}

  @Get('capabilities')
  @ApiOkResponse({
    description:
      'What this deployment can authenticate with. `socialProviders` is empty when none are configured; clients must then not offer social sign-in.',
    type: AuthCapabilitiesDto,
  })
  getCapabilities(): AuthCapabilitiesDto {
    // Straight from the bundle, which derives it from the options actually given to
    // better-auth — so this can never advertise a provider the auth handler would reject.
    return { socialProviders: [...this.bundle.enabledSocialProviders] }
  }
}
