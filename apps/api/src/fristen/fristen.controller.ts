import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { DeadlinesService } from './fristen.service.js'
import { DeadlinesResponseDto } from './dto/fristen-response.dto.js'

@ApiTags('fristen')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class FristenController {
  constructor(@Inject(DeadlinesService) private readonly fristenService: DeadlinesService) {}

  @Get(':jahr/fristen')
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit); the Abgabefrist itself throws a 400 for a year outside the per-year Regelwerk (ADR-022).',
  })
  @ApiOkResponse({ type: DeadlinesResponseDto, description: 'The honest Fristen-Fakt (ADR-0039) — a banner input, never a tax status. Readable for guests (statutory facts, not user data).' })
  getFristen(@Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<DeadlinesResponseDto> {
    return this.fristenService.getFristen(jahr)
  }
}
