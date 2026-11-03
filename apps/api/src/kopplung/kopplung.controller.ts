import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiForbiddenResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { accountKeyedTracker, KOPPLUNG_BEITRITT_THROTTLE } from '../rate-limit/rate-limit.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { KopplungService } from './kopplung.service.js'
import { KopplungPersonBDto, KopplungResponseDto, SetKopplungDto } from './dto/kopplung.dto.js'

@ApiTags('kopplung')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class KopplungController {
  constructor(@Inject(KopplungService) private readonly kopplungService: KopplungService) {}

  @Get(':jahr/kopplung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: KopplungResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<KopplungResponseDto> {
    return this.kopplungService.get(userId, jahr)
  }

  @Put(':jahr/kopplung')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: SetKopplungDto })
  @ApiOkResponse({ type: KopplungResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  @ApiForbiddenResponse({ description: 'Only Person A sets the Veranlagungsart.' })
  set(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: SetKopplungDto,
  ): Promise<KopplungResponseDto> {
    return this.kopplungService.set(userId, jahr, dto)
  }

  @Put(':jahr/kopplung/person-b')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: KopplungPersonBDto })
  @ApiOkResponse({ type: KopplungResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  @ApiForbiddenResponse({ description: 'Person B joined with an own account; only they edit their data.' })
  updatePersonB(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: KopplungPersonBDto,
  ): Promise<KopplungResponseDto> {
    return this.kopplungService.updatePersonB(userId, jahr, dto)
  }

  @Post(':jahr/kopplung/beitreten/:code')
  @HttpCode(200)
  @RequiresAccount()
  @Throttle({ default: { ...KOPPLUNG_BEITRITT_THROTTLE, getTracker: accountKeyedTracker } })
  @UseGuards(ThrottlerGuard)
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'code', type: String, example: '9F3A0C71B2E4D658' })
  @ApiOkResponse({ type: KopplungResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  joinWithCode(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('code') code: string,
  ): Promise<KopplungResponseDto> {
    return this.kopplungService.joinWithCode(userId, jahr, code)
  }
}
