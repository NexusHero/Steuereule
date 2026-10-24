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
// never just "parses as a number" (same pipe as Cockpit/Lstb/Interview).
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ParseLohnausweisFeldPipe } from './parse-lohnausweis-feld.pipe.js'
import { ChLohnausweisService } from './ch-lohnausweis.service.js'
import { PutLohnausweisFeldDto } from './dto/lohnausweis-feld.dto.js'
import { PutWechselkursDto } from './dto/wechselkurs.dto.js'
import { PutBemerkungenDto, PutVorsorgeDto } from './dto/ch-posten.dto.js'
import { ChLohnausweisResponseDto } from './dto/ch-lohnausweis-response.dto.js'

@ApiTags('ch-lohnausweis')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class ChLohnausweisController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(ChLohnausweisService) private readonly service: ChLohnausweisService) {}

  @Get(':jahr/ch-lohnausweis')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: ChLohnausweisResponseDto, description: 'The caller’s CH-Lohnausweis mask + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<ChLohnausweisResponseDto> {
    return this.service.getState(userId, jahr)
  }

  @Put(':jahr/ch-lohnausweis/:feld')
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
    example: 'bruttolohn-total',
    description: 'One of the 14 CHF-betrag Lohnausweis fields (ParseLohnausweisFeldPipe).',
  })
  @ApiBody({ type: PutLohnausweisFeldDto })
  @ApiOkResponse({ type: ChLohnausweisResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setFeld(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('feld', ParseLohnausweisFeldPipe) feld: Parameters<ChLohnausweisService['setFeld']>[2],
    @Body() dto: PutLohnausweisFeldDto,
  ): Promise<ChLohnausweisResponseDto> {
    return this.service.setFeld(userId, jahr, feld, dto)
  }

  @Put(':jahr/ch-lohnausweis/bemerkungen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutBemerkungenDto })
  @ApiOkResponse({ type: ChLohnausweisResponseDto, description: 'The updated mask and its derived fold.' })
  setBemerkungen(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: PutBemerkungenDto,
  ): Promise<ChLohnausweisResponseDto> {
    return this.service.setBemerkungen(userId, jahr, dto)
  }

  @Put(':jahr/ch-lohnausweis/vorsorge')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutVorsorgeDto })
  @ApiOkResponse({ type: ChLohnausweisResponseDto, description: 'The updated mask and its derived fold.' })
  setVorsorge(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: PutVorsorgeDto,
  ): Promise<ChLohnausweisResponseDto> {
    return this.service.setVorsorge(userId, jahr, dto)
  }

  @Put(':jahr/ch-lohnausweis/wechselkurs')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutWechselkursDto })
  @ApiOkResponse({ type: ChLohnausweisResponseDto, description: 'The updated mask and its derived fold.' })
  setWechselkurs(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: PutWechselkursDto,
  ): Promise<ChLohnausweisResponseDto> {
    return this.service.setWechselkurs(userId, jahr, dto)
  }
}
