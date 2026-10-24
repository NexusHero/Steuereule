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
// Reused directly, not duplicated — `jahr` is always validated against a sensible tax-year window,
// never just "parses as a number" (same pipe as Cockpit/Lstb/ChLohnausweis).
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ParseRenteFeldPipe } from './parse-rente-feld.pipe.js'
import { RenteService } from './rente.service.js'
import { PutRenteFeldDto } from './dto/rente-feld.dto.js'
import { PutRentenartDto } from './dto/rente-art.dto.js'
import { RenteResponseDto } from './dto/rente-response.dto.js'

@ApiTags('rente')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class RenteController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(RenteService) private readonly renteService: RenteService) {}

  @Get(':jahr/rente')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: RenteResponseDto, description: 'The caller’s Rentner mask + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<RenteResponseDto> {
    return this.renteService.getState(userId, jahr)
  }

  @Put(':jahr/rente/art')
  // Upsert-style write on an existing tax-year resource (one row per userId+steuerjahr) → 200.
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutRentenartDto })
  @ApiOkResponse({ type: RenteResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setRentenart(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: PutRentenartDto,
  ): Promise<RenteResponseDto> {
    return this.renteService.setRentenart(userId, jahr, dto)
  }

  @Put(':jahr/rente/:feld')
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
    example: 'jahresbetrag',
    description: 'One of jahresbetrag | rentenbeginnJahr | alterBeiRentenbeginn (ParseRenteFeldPipe).',
  })
  @ApiBody({ type: PutRenteFeldDto })
  @ApiOkResponse({ type: RenteResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setFeld(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('feld', ParseRenteFeldPipe) feld: Parameters<RenteService['setFeld']>[2],
    @Body() dto: PutRenteFeldDto,
  ): Promise<RenteResponseDto> {
    return this.renteService.setFeld(userId, jahr, feld, dto)
  }
}
