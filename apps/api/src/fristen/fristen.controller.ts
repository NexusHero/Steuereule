import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
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
  // Explicit token — see the comment on ProfileController's constructor. `userId` is resolved by
  // UserContextGuard + @RequiresAccount (the fristen themselves carry no user data, but the
  // endpoint is account-scoped for consistency with the Cockpit's other reads).
  constructor(@Inject(FristenService) private readonly fristenService: FristenService) {}

  @Get(':jahr/fristen')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit); the Abgabefrist itself throws a 400 for a year outside the per-year Regelwerk (ADR-022).',
  })
  @ApiOkResponse({ type: FristenResponseDto, description: 'The honest Fristen-Fakt (ADR-0039) — a banner input, never a tax status.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  getFristen(@CurrentUser() _userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<FristenResponseDto> {
    return this.fristenService.getFristen(jahr)
  }
}
