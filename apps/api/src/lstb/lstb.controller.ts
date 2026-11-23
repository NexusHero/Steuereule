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
import { ParseTaxYearPipe } from '../common/parse-tax-year.pipe.js'
import { LinkService } from '../link/link.service.js'
import { ParsePersonPipe } from '../link/parse-person.pipe.js'
import { ParseLstbFieldPipe } from './parse-lstb-field.pipe.js'
import { LstbService } from './lstb.service.js'
import { LstbFieldDto } from './dto/lstb-field.dto.js'
import { LstbResponseDto } from './dto/lstb-response.dto.js'
import { LstbChurchTaxDto } from './dto/lstb-church-tax.dto.js'
import { LstbSubsidiesDto } from './dto/lstb-subsidies.dto.js'
import { LstbEmployerDto } from './dto/lstb-employer.dto.js'
import { LstbLinesDto, LstbLinesResponseDto } from './dto/lstb-lines.dto.js'

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

  @Get(':jahr/lstb-kirchensteuer')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiOkResponse({ type: LstbChurchTaxDto, description: 'Church tax withheld per LStB, Zeilen 6 und 7 (ADR-0063).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the figures of a partner without an own account (ADR-0054).' })
  async getChurchTax(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbChurchTaxDto> {
    return this.lstbService.getChurchTax(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/lstb-kirchensteuer')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: LstbChurchTaxDto })
  @ApiOkResponse({ type: LstbChurchTaxDto, description: 'The stored church tax lines.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the figures of a partner without an own account (ADR-0054).' })
  async setChurchTax(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: LstbChurchTaxDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbChurchTaxDto> {
    return this.lstbService.setChurchTax(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Get(':jahr/lstb-zeilen')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiOkResponse({ type: LstbLinesResponseDto, description: 'LStB Zeilen 22–27, 24c and 5 line by line, with the sum the app keeps (ADR-0093).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the figures of a partner without an own account (ADR-0054).' })
  async getLines(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbLinesResponseDto> {
    return this.lstbService.getLines(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/lstb-zeilen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: LstbLinesDto })
  @ApiOkResponse({ type: LstbLinesResponseDto, description: 'The stored lines; `sozialversicherung` is their sum once Zeilen 23, 25, 26 and 27 are recorded.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the figures of a partner without an own account (ADR-0054).' })
  async setLines(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: LstbLinesDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbLinesResponseDto> {
    return this.lstbService.setLines(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Get(':jahr/lstb-arbeitgeber')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiOkResponse({ type: LstbEmployerDto, description: 'The employer named on the LStB (ADR-0099 §8).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the figures of a partner without an own account (ADR-0054).' })
  async getEmployer(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbEmployerDto> {
    return this.lstbService.getEmployer(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/lstb-arbeitgeber')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: LstbEmployerDto })
  @ApiOkResponse({ type: LstbEmployerDto, description: 'The stored employer name.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the figures of a partner without an own account (ADR-0054).' })
  async setEmployer(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: LstbEmployerDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbEmployerDto> {
    return this.lstbService.setEmployer(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Get(':jahr/lstb-zuschuesse')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiOkResponse({ type: LstbSubsidiesDto, description: 'Tax-free employer subsidies to health and care insurance per LStB, Zeile 24 (ADR-0090).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the figures of a partner without an own account (ADR-0054).' })
  async getSubsidies(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbSubsidiesDto> {
    return this.lstbService.getSubsidies(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/lstb-zuschuesse')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: LstbSubsidiesDto })
  @ApiOkResponse({ type: LstbSubsidiesDto, description: 'The stored subsidies line.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the figures of a partner without an own account (ADR-0054).' })
  async setSubsidies(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: LstbSubsidiesDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbSubsidiesDto> {
    return this.lstbService.setSubsidies(await this.link.dataUser(userId, year, person), year, dto)
  }
}
