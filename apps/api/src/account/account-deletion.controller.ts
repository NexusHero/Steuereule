import { Body, Controller, Delete, Inject, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { VERIFY_PASSWORD_THROTTLE, accountKeyedTracker } from '../rate-limit/rate-limit.js'
import { AccountDeletionService } from './account-deletion.service.js'
import { DeleteAccountRequestDto } from './dto/delete-account-request.dto.js'
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto.js'

@ApiTags('account')
@Controller('v1/account')
@UseGuards(UserContextGuard)
export class AccountDeletionController {
  constructor(
    @Inject(AccountDeletionService) private readonly accountService: AccountDeletionService,
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
  ) {}

  @Delete()
  @ForbidAssistant()
  @Throttle({ default: { ...VERIFY_PASSWORD_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
  @ApiBody({ type: DeleteAccountRequestDto })
  @ApiOkResponse({
    type: DeleteAccountResponseDto,
    description: 'The account was torn down (ADR-0013). An honest summary of what was erased, anonymised-and-retained, or held under active Löschschutz.',
  })
  @ApiBadRequestResponse({
    description: '`confirm` was not exactly `true`, or the session is not fresh enough and no `password` was given (re-verification required).',
  })
  @ApiUnauthorizedResponse({ description: 'The given `password` failed re-verification.' })
  @ApiForbiddenResponse({ description: 'A guest session — there is no real account here to delete.' })
  @ApiResponse({ status: 429, description: 'Too many password re-verification attempts; the throttler limit (ADR-0013 §6, 10s/3 per account) tripped.' })
  async deleteAccount(
    @CurrentUser() userId: string,
    @Body() dto: DeleteAccountRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DeleteAccountResponseDto> {
    const result = await this.accountService.deleteAccount(userId, dto, request.headers)

    reply.setCookie(this.betterAuth.sessionCookieName, '', {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
      maxAge: 0,
    })

    return result
  }
}
