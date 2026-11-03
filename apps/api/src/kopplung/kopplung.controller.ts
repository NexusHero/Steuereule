import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
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
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'code', type: String, example: 'A1B2C3D4' })
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
