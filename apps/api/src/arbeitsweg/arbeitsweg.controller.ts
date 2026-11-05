import { Body, Controller, Get, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { KopplungService } from '../kopplung/kopplung.service.js'
import { ParsePersonPipe } from '../kopplung/parse-person.pipe.js'
import { ArbeitswegService } from './arbeitsweg.service.js'
import { ArbeitswegEingabenDto, ArbeitswegResponseDto } from './dto/arbeitsweg.dto.js'

@ApiTags('arbeitsweg')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class ArbeitswegController {
  constructor(
    @Inject(KopplungService) private readonly kopplung: KopplungService,
    @Inject(ArbeitswegService) private readonly service: ArbeitswegService,
  ) {}

  @Get(':jahr/arbeitsweg')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: ArbeitswegResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the commute of a partner without an own account (ADR-0054).' })
  async get(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ArbeitswegResponseDto> {
    return this.service.getState(await this.kopplung.datenNutzer(userId, jahr, person), jahr)
  }

  @Put(':jahr/arbeitsweg')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: ArbeitswegEingabenDto })
  @ApiOkResponse({ type: ArbeitswegResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the commute of a partner without an own account (ADR-0054).' })
  async put(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() body: ArbeitswegEingabenDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ArbeitswegResponseDto> {
    return this.service.save(await this.kopplung.datenNutzer(userId, jahr, person), jahr, {
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
