import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { FristenService } from './fristen.service.js'
import { FristenResponseDto } from './dto/fristen-response.dto.js'

@ApiTags('fristen')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class FristenController {
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
