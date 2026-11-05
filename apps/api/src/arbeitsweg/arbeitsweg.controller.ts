import { Body, Controller, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ArbeitswegService } from './arbeitsweg.service.js'
import { ArbeitswegEingabenDto, ArbeitswegResponseDto } from './dto/arbeitsweg.dto.js'

@ApiTags('arbeitsweg')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class ArbeitswegController {
  constructor(@Inject(ArbeitswegService) private readonly service: ArbeitswegService) {}

  @Get(':jahr/arbeitsweg')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: ArbeitswegResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<ArbeitswegResponseDto> {
    return this.service.getState(userId, jahr)
  }

  @Put(':jahr/arbeitsweg')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: ArbeitswegEingabenDto })
  @ApiOkResponse({ type: ArbeitswegResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  put(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() body: ArbeitswegEingabenDto,
  ): Promise<ArbeitswegResponseDto> {
    return this.service.save(userId, jahr, {
      arbeitstage: body.arbeitstage,
      urlaubstage: body.urlaubstage,
      krankheitstage: body.krankheitstage,
      homeofficeTage: body.homeofficeTage,
      einfacheKm: body.einfacheKm ?? null,
      verkehrsmittel: body.verkehrsmittel ?? null,
      taetigkeitsstaette: body.taetigkeitsstaette?.trim() || null,
    })
  }
}
