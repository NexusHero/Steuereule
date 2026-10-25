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
import type { KirchensteuerFaktor } from '@steuereule/core'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
// Reused directly, not duplicated — `jahr` is always validated against a sensible tax-year window,
// never just "parses as a number" (same pipe as Cockpit/Lstb/Rente).
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ParseKapitalFeldPipe } from './parse-kapital-feld.pipe.js'
import { KapitalService } from './kapital.service.js'
import { PutKapitalFeldDto } from './dto/kapital-feld.dto.js'
import { KapitalResponseDto } from './dto/kapital-response.dto.js'
import { GuenstigerpruefungDto, GuenstigerpruefungHerkunftDto } from './dto/guenstigerpruefung-response.dto.js'
import { UnschaerfeDto } from '../veranlagungsartenvergleich/dto/veranlagungsartenvergleich-response.dto.js'

/** §51a EStG — the closed set of Kirchensteuer factors this API admits (0 = none). */
const KIST_FAKTOREN: readonly KirchensteuerFaktor[] = [0, 0.08, 0.09]

/** A query `kirchensteuerFaktor` → one of {0, 0.08, 0.09}, defaulting to 0 (M1 collects none). */
function parseKirchensteuerFaktor(raw: unknown): KirchensteuerFaktor {
  if (raw === undefined) return 0
  const parsed = Number(raw)
  if (!KIST_FAKTOREN.includes(parsed as KirchensteuerFaktor)) {
    throw new BadRequestException('kirchensteuerFaktor must be one of 0, 0.08, 0.09')
  }
  return parsed as KirchensteuerFaktor
}

@ApiTags('kapital')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class KapitalController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(KapitalService) private readonly kapitalService: KapitalService) {}

  @Get(':jahr/kapital')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: KapitalResponseDto, description: 'The caller’s Kapital mask + depot-Einordnung + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<KapitalResponseDto> {
    return this.kapitalService.getState(userId, jahr)
  }

  @Put(':jahr/kapital/:feld')
  // Upsert-style write on an existing tax-year resource (one row per userId+steuerjahr) → 200.
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiParam({
    name: 'feld',
    type: String,
    example: 'kapitalertraege',
    description: 'The Kapital field id (ParseKapitalFeldPipe — today only `kapitalertraege`).',
  })
  @ApiBody({ type: PutKapitalFeldDto })
  @ApiOkResponse({ type: KapitalResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setFeld(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('feld', ParseKapitalFeldPipe) feld: Parameters<KapitalService['setFeld']>[2],
    @Body() dto: PutKapitalFeldDto,
  ): Promise<KapitalResponseDto> {
    return this.kapitalService.setFeld(userId, jahr, feld, dto)
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
  @ApiExtraModels(GuenstigerpruefungDto, GuenstigerpruefungHerkunftDto, UnschaerfeDto)
  @ApiOkResponse({
    description:
      'The § 32d Abs. 6 Günstigerprüfung for the given tax year (Abgeltungsteuer vs. persönlicher Satz, ADR-0034-Muster, Einzelveranlagung in M1), or null when no tax year has been seeded yet (the honest empty state, not a 404).',
    schema: { allOf: [{ $ref: getSchemaPath(GuenstigerpruefungDto) }], nullable: true },
  })
  getGuenstigerpruefung(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Query('kirchensteuerFaktor') kirchensteuerFaktorRaw: unknown,
  ): Promise<GuenstigerpruefungDto | null> {
    const kirchensteuerFaktor = parseKirchensteuerFaktor(kirchensteuerFaktorRaw)
    return this.kapitalService.getGuenstigerpruefung(userId, jahr, kirchensteuerFaktor)
  }
}
