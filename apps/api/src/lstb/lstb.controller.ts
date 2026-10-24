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
// Reused directly, not duplicated — same lesson as the interview controller: `jahr` is
// always validated against a sensible tax-year window, never just "parses as a number".
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ParseLstbFeldPipe } from './parse-lstb-feld.pipe.js'
import { LstbService } from './lstb.service.js'
import { LstbFeldDto } from './dto/lstb-feld.dto.js'
import { LstbResponseDto } from './dto/lstb-response.dto.js'

@ApiTags('lstb')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class LstbController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(LstbService) private readonly lstbService: LstbService) {}

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
  getLstb(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<LstbResponseDto> {
    return this.lstbService.getState(userId, jahr)
  }

  @Put(':jahr/lstb/:feld')
  // Upsert-style write on an existing tax-year resource (one row per userId+steuerjahr) → 200.
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
  // Explicit @ApiBody(): see ProfileController's PUT for why esbuild/tsx needs this spelled out.
  @ApiBody({ type: LstbFeldDto })
  @ApiOkResponse({ type: LstbResponseDto, description: 'The updated mask and its derived zustand.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setFeld(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('feld', ParseLstbFeldPipe) feld: Parameters<LstbService['setFeld']>[2],
    @Body() dto: LstbFeldDto,
  ): Promise<LstbResponseDto> {
    return this.lstbService.setFeld(userId, jahr, feld, dto)
  }
}
