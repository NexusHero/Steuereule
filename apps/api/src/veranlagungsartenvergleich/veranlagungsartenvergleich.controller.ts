import { BadRequestException, Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, ApiParam, ApiQuery, ApiTags, getSchemaPath } from '@nestjs/swagger'
import type { KirchensteuerFaktor } from '@steuereule/core'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { VeranlagungsartenvergleichDto, VergleichsHerkunftDto, UnschaerfeDto } from './dto/veranlagungsartenvergleich-response.dto.js'
import { VeranlagungsartenvergleichService } from './veranlagungsartenvergleich.service.js'

/** §51a EStG — the closed set of Kirchensteuer factors this API admits (0 = none). */
const KIST_FAKTOREN: readonly KirchensteuerFaktor[] = [0, 0.08, 0.09]

/** A query `verheiratet` → a boolean; absent is treated as "not married" (honest M1 default). */
function parseVerheiratet(raw: unknown): boolean {
  if (raw === undefined) return false
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new BadRequestException('verheiratet must be "true" or "false"')
}

/** A query `zveB` → a non-negative finite number (the partner's zvE-basis), or undefined when absent. */
function parseZveB(raw: unknown): number | undefined {
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestException('zveB must be a non-negative number (the partner zvE-basis, in whole euros)')
  }
  return parsed
}

/** A query `kirchensteuerFaktor` → one of {0, 0.08, 0.09}, defaulting to 0 (M1 collects none). */
function parseKirchensteuerFaktor(raw: unknown): KirchensteuerFaktor {
  if (raw === undefined) return 0
  const parsed = Number(raw)
  if (!KIST_FAKTOREN.includes(parsed as KirchensteuerFaktor)) {
    throw new BadRequestException('kirchensteuerFaktor must be one of 0, 0.08, 0.09')
  }
  return parsed as KirchensteuerFaktor
}

@ApiTags('veranlagungsartenvergleich')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class VeranlagungsartenvergleichController {
  constructor(@Inject(VeranlagungsartenvergleichService) private readonly service: VeranlagungsartenvergleichService) {}

  @Get(':jahr/veranlagungsartenvergleich')
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) to compare — validated to a sensible window (2000..currentYear+1), never just "parses as a number".',
  })
  @ApiQuery({
    name: 'verheiratet',
    required: false,
    type: Boolean,
    example: true,
    description:
      'The married flag (ADR-0034 gate: only a married couple can choose Einzel- vs. Zusammenveranlagung). M1 does not persist it yet (the Segment-2 `partner` question is declared but not admitted server-side), so it is an explicit input.',
  })
  @ApiQuery({
    name: 'zveB',
    required: false,
    type: Number,
    example: 40000,
    description:
      'The partner zvE-basis (whole euros). M1 does not yet collect the partner’s income, so it is an explicit input, never a fabricated zero. Required once the comparison applies (married + income recorded).',
  })
  @ApiQuery({
    name: 'kirchensteuerFaktor',
    required: false,
    type: Number,
    example: 0,
    description: '§51a EStG Kirchensteuer factor (0, 0.08, 0.09). Defaults to 0 — M1 collects none.',
  })
  @ApiExtraModels(VeranlagungsartenvergleichDto, UnschaerfeDto, VergleichsHerkunftDto)
  @ApiOkResponse({
    description:
      'The Veranlagungsartenvergleich for the given tax year (Einzel- vs. Zusammenveranlagung, ADR-0034), or null when no tax year has been seeded yet (the honest empty state, not a 404).',
    schema: { allOf: [{ $ref: getSchemaPath(VeranlagungsartenvergleichDto) }], nullable: true },
  })
  getVergleich(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Query('verheiratet') verheiratetRaw: unknown,
    @Query('zveB') zveBRaw: unknown,
    @Query('kirchensteuerFaktor') kirchensteuerFaktorRaw: unknown,
  ): Promise<VeranlagungsartenvergleichDto | null> {
    const verheiratet = parseVerheiratet(verheiratetRaw)
    const zveB = parseZveB(zveBRaw)
    const kirchensteuerFaktor = parseKirchensteuerFaktor(kirchensteuerFaktorRaw)
    // zveB may legitimately be absent when the comparison does not apply (single / no income) —
    // the service is the single place that knows whether it applies, and it surfaces the missing
    // input as a 400 rather than inventing a partner income.
    return this.service.getVergleich(userId, jahr, verheiratet, zveB, kirchensteuerFaktor)
  }
}
