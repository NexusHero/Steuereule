import { Body, Controller, Delete, Inject, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { AccountDeletionService } from './account-deletion.service.js'
import { DeleteAccountRequestDto } from './dto/delete-account-request.dto.js'
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto.js'

@ApiTags('account')
@Controller('v1/account')
@UseGuards(UserContextGuard)
export class AccountDeletionController {
  // Explicit tokens — see the comment on ProfileController's constructor: the
  // toolchain (tsx/esbuild + Vitest/SWC) never emits `design:paramtypes` metadata, so
  // Nest's implicit type-based constructor injection would silently resolve undefined.
  constructor(
    @Inject(AccountDeletionService) private readonly accountService: AccountDeletionService,
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
  ) {}

  @Delete()
  // Explicit @ApiBody(): Nest's Swagger plugin otherwise infers the schema from
  // reflected `design:paramtypes` metadata, which esbuild/tsx never emit — without
  // this the generated OpenAPI document (and therefore orval's client) silently loses
  // the request body, exactly the PutProfileDto comment explains.
  @ApiBody({ type: DeleteAccountRequestDto })
  @ApiOkResponse({
    type: DeleteAccountResponseDto,
    description: 'The account was torn down (ADR-0013). An honest summary of what was erased, anonymised-and-retained, or held under active Löschschutz.',
  })
  // Explicit error responses (previously undocumented — swagger only had the 200) so the
  // FE's orval-generated client can discriminate on `.status` instead of an untyped `as
  // number` cast: each of these is a distinct, real branch (ADR-0013 §6/fresh-auth.ts)
  // that the Datenschutz screen renders its own honest message for (REQ-011).
  @ApiBadRequestResponse({
    description: '`confirm` was not exactly `true`, or the session is not fresh enough and no `password` was given (re-verification required).',
  })
  @ApiUnauthorizedResponse({ description: 'The given `password` failed re-verification.' })
  @ApiForbiddenResponse({ description: 'A guest session — there is no real account here to delete.' })
  @ApiResponse({ status: 429, description: 'Too many password re-verification attempts; the existing DB-backed rate limit tripped (ADR-0013 §6).' })
  async deleteAccount(
    @CurrentUser() userId: string,
    @Body() dto: DeleteAccountRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DeleteAccountResponseDto> {
    const result = await this.accountService.deleteAccount(userId, dto, request.headers)

    // The client clears its session on success (ADR-0013's frozen contract) — the
    // Session row is already gone (cascaded off User inside the transaction), but the
    // browser must not keep sending a cookie that now resolves to nothing. Mirrors
    // the guest-cookie retirement in guest-account-upgrade.ts (same attributes as the
    // cookie better-auth itself set, so the browser actually clears it).
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
