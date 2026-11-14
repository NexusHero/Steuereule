import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common'
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
import { PutCrossBorderFactsDto } from './dto/cross-border-facts.dto.js'
import { ParseSalaryCertificateFieldPipe } from './parse-salary-certificate-field.pipe.js'
import { ChSalaryCertificateService } from './ch-salary-certificate.service.js'
import { PutSalaryCertificateFieldDto } from './dto/salary-certificate-field.dto.js'
import { PutExchangeRateDto } from './dto/exchange-rate.dto.js'
import { PutRemarksDto, PutProvisionDto, PutNGreDto } from './dto/ch-item.dto.js'
import { ChSalaryCertificateResponseDto } from './dto/ch-salary-certificate-response.dto.js'

@ApiTags('ch-lohnausweis')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class ChSalaryCertificateController {
  constructor(
    @Inject(ChSalaryCertificateService) private readonly service: ChSalaryCertificateService,
    @Inject(LinkService) private readonly link: LinkService,
  ) {}

  @Get(':jahr/ch-lohnausweis')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The caller’s CH-Lohnausweis mask + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the Swiss figures of a partner without an own account (ADR-0054).' })
  async get(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.getState(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/ch-lohnausweis/:feld')
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
    example: 'bruttolohn-total',
    description: 'One of the 14 CHF-betrag Lohnausweis fields (ParseLohnausweisFeldPipe).',
  })
  @ApiBody({ type: PutSalaryCertificateFieldDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the Swiss figures of a partner without an own account (ADR-0054).' })
  async setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('feld', ParseSalaryCertificateFieldPipe) field: Parameters<ChSalaryCertificateService['setField']>[2],
    @Body() dto: PutSalaryCertificateFieldDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setField(await this.link.dataUser(userId, year, person), year, field, dto)
  }

  @Put(':jahr/ch-lohnausweis/bemerkungen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutRemarksDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the Swiss figures of a partner without an own account (ADR-0054).' })
  async setRemarks(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutRemarksDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setRemarks(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Put(':jahr/ch-lohnausweis/vorsorge')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutProvisionDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the Swiss figures of a partner without an own account (ADR-0054).' })
  async setProvision(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutProvisionDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setProvision(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Put(':jahr/ch-lohnausweis/n-gre')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutNGreDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask including the Anlage-N-Gre facts.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the Swiss figures of a partner without an own account (ADR-0054).' })
  async setNGre(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutNGreDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setNGre(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Put(':jahr/ch-lohnausweis/wechselkurs')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutExchangeRateDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the Swiss figures of a partner without an own account (ADR-0054).' })
  async setExchangeRate(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutExchangeRateDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setExchangeRate(await this.link.dataUser(userId, year, person), year, dto)
  }

  @Put(':jahr/ch-lohnausweis/grenzgaenger')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025, description: 'The tax year (Steuerjahr).' })
  @ApiQuery({ name: 'person', required: true, enum: ['B'], description: 'Only for Person B: the user answers these questions in the interview.' })
  @ApiBody({ type: PutCrossBorderFactsDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'Person B’s mask with the Grenzgänger status the answers give.' })
  async setCrossBorderFacts(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutCrossBorderFactsDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<ChSalaryCertificateResponseDto> {
    if (person !== 'B') throw new BadRequestException('The user answers the Grenzgänger questions in the interview; this is for Person B.')
    return this.service.setCrossBorderFacts(await this.link.dataUser(userId, year, 'B'), year, dto)
  }
}
