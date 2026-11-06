import { Body, Controller, Get, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { LinkService } from '../kopplung/kopplung.service.js'
import { ParsePersonPipe } from '../kopplung/parse-person.pipe.js'
import { ParseLstbFieldPipe } from './parse-lstb-feld.pipe.js'
import { LstbService } from './lstb.service.js'
import { LstbFieldDto } from './dto/lstb-feld.dto.js'
import { LstbResponseDto } from './dto/lstb-response.dto.js'

@ApiTags('lstb')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class LstbController {
  constructor(
    @Inject(LinkService) private readonly link: LinkService,
    @Inject(LstbService) private readonly lstbService: LstbService,
  ) {}

  @Get(':jahr/lstb')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: LstbResponseDto, description: 'The caller’s LStB mask state for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the figures of a partner without an own account (ADR-0054).' })
  async getLstb(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbResponseDto> {
    return this.lstbService.getState(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/lstb/:feld')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiParam({
    name: 'feld',
    type: String,
    example: 'bruttoarbeitslohn',
    description: 'One of bruttoarbeitslohn | lohnsteuer | sozialversicherung (ParseLstbFeldPipe).',
  })
  @ApiBody({ type: LstbFieldDto })
  @ApiOkResponse({ type: LstbResponseDto, description: 'The updated mask and its derived zustand.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the figures of a partner without an own account (ADR-0054).' })
  async setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('feld', ParseLstbFieldPipe) field: Parameters<LstbService['setField']>[2],
    @Body() dto: LstbFieldDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbResponseDto> {
    return this.lstbService.setField(await this.link.dataUser(userId, year, person), year, field, dto)
  }
}
