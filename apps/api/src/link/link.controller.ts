import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { FastifyRequest } from 'fastify'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { FreshAuthChecker } from '../auth/fresh-auth.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { RequiresStepUp } from '../auth/requires-step-up.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { accountKeyedTracker, LINK_JOIN_THROTTLE } from '../rate-limit/rate-limit.js'
import { ParseTaxYearPipe } from '../common/parse-tax-year.pipe.js'
import { LinkService } from './link.service.js'
import { LinkPersonBDto, LinkResponseDto, SetLinkDto } from './dto/link.dto.js'
import { UserWrite } from '../common/user-write.decorator.js'

@ApiTags('kopplung')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class LinkController {
  constructor(
    @Inject(LinkService) private readonly linkService: LinkService,
    @Inject(FreshAuthChecker) private readonly freshAuth: FreshAuthChecker,
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
  ) {}

  @Get(':jahr/kopplung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: LinkResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<LinkResponseDto> {
    return this.linkService.get(userId, year)
  }

  @Put(':jahr/kopplung')
  @UserWrite('kopplung')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: SetLinkDto })
  @ApiOkResponse({ type: LinkResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  @ApiForbiddenResponse({ description: 'Only Person A sets the Veranlagungsart.' })
  @ApiBadRequestResponse({ description: 'FRESH_AUTH_REQUIRED: a new invitation code grants access to a third party and needs the step-up.' })
  set(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SetLinkDto,
    @Req() request: FastifyRequest,
  ): Promise<LinkResponseDto> {
    // Minting an invitation code grants whoever holds it access to this year (step-up rule, 'grants-third-party').
    return this.linkService.set(userId, year, dto, new Date(), () => this.freshAuth.assertFreshSessionOrStepUp(this.betterAuth, request.headers, userId))
  }

  @Put(':jahr/kopplung/person-b')
  @UserWrite('profil', 'stammdaten')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: LinkPersonBDto })
  @ApiOkResponse({ type: LinkResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  @ApiForbiddenResponse({ description: 'Person B joined with an own account; only they edit their data.' })
  updatePersonB(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: LinkPersonBDto,
  ): Promise<LinkResponseDto> {
    return this.linkService.updatePersonB(userId, year, dto)
  }

  @Post(':jahr/kopplung/beitreten/:code')
  @UserWrite('kopplung')
  @HttpCode(200)
  @RequiresAccount()
  @Throttle({ default: { ...LINK_JOIN_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
  // Joining shows the joiner's Steuer-ID, birth date and religion to Person A (API-12).
  @RequiresStepUp('exposes-other-person')
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'code', type: String, example: '9F3A0C71B2E4D658' })
  @ApiOkResponse({ type: LinkResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  joinWithCode(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('code') code: string,
  ): Promise<LinkResponseDto> {
    return this.linkService.joinWithCode(userId, year, code)
  }

  @Post(':jahr/kopplung/zustimmung')
  @UserWrite('kopplung')
  @HttpCode(200)
  @RequiresAccount()
  // Agreeing shows the caller's data to Person A for this year (decision 3, API-3).
  @RequiresStepUp('exposes-other-person')
  @ApiParam({ name: 'jahr', type: Number, example: 2026 })
  @ApiOkResponse({ type: LinkResponseDto, description: 'Person B agrees, in B’s own app, to share this tax year with Person A.' })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  consent(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<LinkResponseDto> {
    return this.linkService.consentForYear(userId, year)
  }
}
