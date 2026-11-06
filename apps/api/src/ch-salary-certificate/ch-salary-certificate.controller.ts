import { Body, Controller, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common'
import {
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
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
  constructor(@Inject(ChSalaryCertificateService) private readonly service: ChSalaryCertificateService) {}

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
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<ChSalaryCertificateResponseDto> {
    return this.service.getState(userId, year)
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
  setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('feld', ParseSalaryCertificateFieldPipe) field: Parameters<ChSalaryCertificateService['setField']>[2],
    @Body() dto: PutSalaryCertificateFieldDto,
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setField(userId, year, field, dto)
  }

  @Put(':jahr/ch-lohnausweis/bemerkungen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutRemarksDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask and its derived fold.' })
  setRemarks(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutRemarksDto,
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setRemarks(userId, year, dto)
  }

  @Put(':jahr/ch-lohnausweis/vorsorge')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutProvisionDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask and its derived fold.' })
  setProvision(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutProvisionDto,
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setProvision(userId, year, dto)
  }

  @Put(':jahr/ch-lohnausweis/n-gre')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutNGreDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask including the Anlage-N-Gre facts.' })
  setNGre(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutNGreDto,
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setNGre(userId, year, dto)
  }

  @Put(':jahr/ch-lohnausweis/wechselkurs')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutExchangeRateDto })
  @ApiOkResponse({ type: ChSalaryCertificateResponseDto, description: 'The updated mask and its derived fold.' })
  setExchangeRate(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutExchangeRateDto,
  ): Promise<ChSalaryCertificateResponseDto> {
    return this.service.setExchangeRate(userId, year, dto)
  }
}
