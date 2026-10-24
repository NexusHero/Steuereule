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
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { BescheidService } from './bescheid.service.js'
import { ParseBescheidFeldPipe } from './parse-bescheid-feld.pipe.js'
import { PutBescheidFeldDto } from './dto/bescheid-feld.dto.js'
import {
  BescheidResponseDto,
  SetBescheidDatumDto,
  SetBescheidStatusDto,
  SetEinspruchDto,
} from './dto/bescheid-response.dto.js'

@ApiTags('bescheid')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class BescheidController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(BescheidService) private readonly service: BescheidService) {}

  @Get(':jahr/bescheid')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiOkResponse({ type: BescheidResponseDto, description: 'The caller’s Bescheid — re-entry (fields + Abgleich + Frist).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<BescheidResponseDto> {
    return this.service.getState(userId, jahr)
  }

  @Put(':jahr/bescheid/feld/:feld')
  // Upsert-style write on an existing tax-year resource (one row per userId+steuerjahr) → 200.
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiParam({ name: 'feld', type: String, example: 'einnahmen', description: 'One of the five Bescheid figures (ParseBescheidFeldPipe).' })
  @ApiBody({ type: PutBescheidFeldDto })
  @ApiOkResponse({ type: BescheidResponseDto, description: 'The updated Bescheid and its derived Abgleich + Frist.' })
  setFeld(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('feld', ParseBescheidFeldPipe) feld: Parameters<BescheidService['setFeld']>[2],
    @Body() dto: PutBescheidFeldDto,
  ): Promise<BescheidResponseDto> {
    return this.service.setFeld(userId, jahr, feld, dto)
  }

  @Put(':jahr/bescheid/datum')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetBescheidDatumDto })
  @ApiOkResponse({ type: BescheidResponseDto, description: 'The updated Bescheid (Bescheiddatum + Frist).' })
  setDatum(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: SetBescheidDatumDto,
  ): Promise<BescheidResponseDto> {
    return this.service.setDatum(userId, jahr, dto)
  }

  @Put(':jahr/bescheid/status')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetBescheidStatusDto })
  @ApiOkResponse({ type: BescheidResponseDto, description: 'The Bescheid after the validated transition.' })
  setStatus(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: SetBescheidStatusDto,
  ): Promise<BescheidResponseDto> {
    return this.service.setStatus(userId, jahr, dto)
  }

  @Put(':jahr/bescheid/einspruch')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetEinspruchDto })
  @ApiOkResponse({ type: BescheidResponseDto, description: 'The Bescheid after filing the Einspruch (validated transition).' })
  setEinspruch(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: SetEinspruchDto,
  ): Promise<BescheidResponseDto> {
    return this.service.setEinspruch(userId, jahr, dto)
  }
}
