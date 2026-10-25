import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { UserContextGuard } from '../auth/user-context.guard.js'
// Reused directly, not duplicated — `jahr` is always validated against a sensible tax-year window,
// never just "parses as a number" (same pipe as Cockpit/Rente/Vermietung).
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { FristenService } from './fristen.service.js'
import { FristenResponseDto } from './dto/fristen-response.dto.js'

@ApiTags('fristen')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class FristenController {
  // Explicit token — see the comment on ProfileController's constructor. The fristen are
  // statutory facts, not user data — same read openness as Cockpit (no @RequiresAccount): the
  // value-first funnel lets a GUEST see the Cockpit-Spanne, and the Warn-Banner (ADR-0039)
  // belongs there too; a frist never reveals anything about the user.
  constructor(@Inject(FristenService) private readonly fristenService: FristenService) {}

  @Get(':jahr/fristen')
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit); the Abgabefrist itself throws a 400 for a year outside the per-year Regelwerk (ADR-022).',
  })
  @ApiOkResponse({ type: FristenResponseDto, description: 'The honest Fristen-Fakt (ADR-0039) — a banner input, never a tax status. Readable for guests (statutory facts, not user data).' })
  getFristen(@Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<FristenResponseDto> {
    return this.fristenService.getFristen(jahr)
  }
}
