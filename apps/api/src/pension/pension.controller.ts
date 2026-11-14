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
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { LinkService } from '../link/link.service.js'
import { ParsePersonPipe } from '../link/parse-person.pipe.js'
import { ParsePensionFieldPipe } from './parse-pension-field.pipe.js'
import { PensionService } from './pension.service.js'
import { PutPensionFieldDto } from './dto/pension-field.dto.js'
import { PutPensionKindDto } from './dto/pension-kind.dto.js'
import { PensionResponseDto } from './dto/pension-response.dto.js'

@ApiTags('rente')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class PensionController {
  constructor(
    @Inject(PensionService) private readonly pensionService: PensionService,
    @Inject(LinkService) private readonly link: LinkService,
  ) {}

  @Get(':jahr/rente')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: PensionResponseDto, description: 'The caller’s Rentner mask + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the pension of a partner without an own account (ADR-0088).' })
  async get(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<PensionResponseDto> {
    return this.pensionService.getState(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/rente/art')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutPensionKindDto })
  @ApiOkResponse({ type: PensionResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the pension of a partner without an own account (ADR-0088).' })
  async setPensionKind(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutPensionKindDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<PensionResponseDto> {
    return this.pensionService.setPensionKind(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Put(':jahr/rente/:feld')
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
    example: 'jahresbetrag',
    description: 'One of jahresbetrag | rentenbeginnJahr | alterBeiRentenbeginn (ParseRenteFeldPipe).',
  })
  @ApiBody({ type: PutPensionFieldDto })
  @ApiOkResponse({ type: PensionResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the pension of a partner without an own account (ADR-0088).' })
  async setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('feld', ParsePensionFieldPipe) field: Parameters<PensionService['setField']>[2],
    @Body() dto: PutPensionFieldDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<PensionResponseDto> {
    return this.pensionService.setField(await this.link.dataUser(userId, year, person), year, field, dto)
  }
}
