import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { accountKeyedTracker, LINK_JOIN_THROTTLE } from '../rate-limit/rate-limit.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { LinkService } from './link.service.js'
import { LinkPersonBDto, LinkResponseDto, SetLinkDto } from './dto/link.dto.js'

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
  @HttpCode(200)
  @RequiresAccount()
  @Throttle({ default: { ...LINK_JOIN_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
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
}
