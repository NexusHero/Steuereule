import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { CurrentUser } from '../auth/current-user.decorator.js'
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
  constructor(@Inject(LinkService) private readonly linkService: LinkService) {}

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
  set(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SetLinkDto,
  ): Promise<LinkResponseDto> {
    return this.linkService.set(userId, year, dto)
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

  @Delete(':jahr/kopplung/zustimmung')
  @UserWrite('kopplung')
  @HttpCode(200)
  @RequiresAccount()
  // A consent given with the step-up is taken back with the same proof: a stolen session must not cut a couple's
  // joint year apart (decision 3).
  @RequiresStepUp('changes-consent')
  @ApiParam({ name: 'jahr', type: Number, example: 2026 })
  @ApiOkResponse({ type: LinkResponseDto, description: 'Person B takes back the consent for this tax year; Person A sees nothing of B for it from now on.' })
  @ApiNotFoundResponse({ description: 'NO_CONSENT_GIVEN: the caller gave no consent for this year.' })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  withdrawConsent(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<LinkResponseDto> {
    return this.linkService.withdrawConsentForYear(userId, year)
  }
}
