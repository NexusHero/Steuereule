import { Body, Controller, Get, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { LinkService } from '../kopplung/kopplung.service.js'
import { ParsePersonPipe } from '../kopplung/parse-person.pipe.js'
import { CommuteService } from './arbeitsweg.service.js'
import { CommuteInputsDto, CommuteResponseDto } from './dto/arbeitsweg.dto.js'

@ApiTags('arbeitsweg')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class CommuteController {
  constructor(
    @Inject(LinkService) private readonly link: LinkService,
    @Inject(CommuteService) private readonly service: CommuteService,
  ) {}

  @Get(':jahr/arbeitsweg')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: CommuteResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the commute of a partner without an own account (ADR-0054).' })
  async get(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<CommuteResponseDto> {
    return this.service.getState(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/arbeitsweg')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: CommuteInputsDto })
  @ApiOkResponse({ type: CommuteResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the commute of a partner without an own account (ADR-0054).' })
  async put(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() body: CommuteInputsDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<CommuteResponseDto> {
    return this.service.save(await this.link.dataUser(userId, year, person), year, {
      arbeitstage: body.arbeitstage,
      urlaubstage: body.urlaubstage,
      krankheitstage: body.krankheitstage,
      homeofficeTage: body.homeofficeTage,
      einfacheKm: body.einfacheKm ?? null,
      verkehrsmittel: body.verkehrsmittel ?? null,
      taetigkeitsstaette: body.taetigkeitsstaette?.trim() || null,
      feiertage: body.feiertage ?? null,
      feiertageRegion: body.feiertageRegion ?? null,
    })
  }
}
