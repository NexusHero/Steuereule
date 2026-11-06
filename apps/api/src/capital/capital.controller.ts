import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger'
import type { ChurchTaxFactor } from '@steuereule/core'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { ParseCapitalFieldPipe } from './parse-capital-field.pipe.js'
import { CapitalService } from './capital.service.js'
import { PutCapitalFieldDto, PutCapitalOwnerDto } from './dto/capital-field.dto.js'
import { CapitalResponseDto } from './dto/capital-response.dto.js'
import { MostFavourableCheckDto, MostFavourableCheckSourceDto } from './dto/most-favourable-check-response.dto.js'
import { UncertaintyDto } from '../filing-type-comparison/dto/filing-type-comparison-response.dto.js'

const CHURCH_TAX_FACTORS: readonly ChurchTaxFactor[] = [0, 0.08, 0.09]

function parseChurchTaxFactor(raw: unknown): ChurchTaxFactor {
  if (raw === undefined) return 0
  const parsed = Number(raw)
  if (!CHURCH_TAX_FACTORS.includes(parsed as ChurchTaxFactor)) {
    throw new BadRequestException('kirchensteuerFaktor must be one of 0, 0.08, 0.09')
  }
  return parsed as ChurchTaxFactor
}

@ApiTags('kapital')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class CapitalController {
  constructor(@Inject(CapitalService) private readonly capitalService: CapitalService) {}

  @Get(':jahr/kapital')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: CapitalResponseDto, description: 'The caller’s Kapital mask + depot-Einordnung + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<CapitalResponseDto> {
    return this.capitalService.getState(userId, year)
  }

  @Put(':jahr/kapital/inhaber')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutCapitalOwnerDto })
  @ApiOkResponse({ type: CapitalResponseDto, description: 'The mask with the stored owner.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setOwner(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutCapitalOwnerDto,
  ): Promise<CapitalResponseDto> {
    return this.capitalService.setOwner(userId, year, dto.inhaber)
  }

  @Put(':jahr/kapital/:feld')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiParam({
    name: 'feld',
    type: String,
    example: 'kapitalertraege',
    description: 'The Kapital field id (ParseKapitalFeldPipe — one of KAPITAL_FELDER).',
  })
  @ApiBody({ type: PutCapitalFieldDto })
  @ApiOkResponse({ type: CapitalResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('feld', ParseCapitalFieldPipe) field: Parameters<CapitalService['setField']>[2],
    @Body() dto: PutCapitalFieldDto,
  ): Promise<CapitalResponseDto> {
    return this.capitalService.setField(userId, year, field, dto)
  }

  @Get(':jahr/kapital/guenstigerpruefung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiQuery({
    name: 'kirchensteuerFaktor',
    required: false,
    type: Number,
    example: 0,
    description: '§51a EStG Kirchensteuer factor (0, 0.08, 0.09). Defaults to 0 — M1 collects none.',
  })
  @ApiExtraModels(MostFavourableCheckDto, MostFavourableCheckSourceDto, UncertaintyDto)
  @ApiOkResponse({
    description:
      'The § 32d Abs. 6 Günstigerprüfung for the given tax year (Abgeltungsteuer vs. persönlicher Satz, ADR-0034-Muster, Einzelveranlagung in M1), or null when no tax year has been seeded yet (the honest empty state, not a 404).',
    schema: { allOf: [{ $ref: getSchemaPath(MostFavourableCheckDto) }], nullable: true },
  })
  getMostFavourableCheck(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('kirchensteuerFaktor') churchTaxFactorRaw: unknown,
  ): Promise<MostFavourableCheckDto | null> {
    const churchTaxFactor = parseChurchTaxFactor(churchTaxFactorRaw)
    return this.capitalService.getMostFavourableCheck(userId, year, churchTaxFactor)
  }
}
