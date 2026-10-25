import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
// Reused directly, not duplicated — `jahr` is always validated against a sensible tax-year window,
// never just "parses as a number" (same pipe as Cockpit/Lstb/ChLohnausweis/Rente).
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ParseVermietungFeldPipe } from './parse-vermietung-feld.pipe.js'
import { VermietungService } from './vermietung.service.js'
import { PutVermietungFeldDto } from './dto/vermietung-feld.dto.js'
import { VermietungResponseDto } from './dto/vermietung-response.dto.js'

@ApiTags('vermietung')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class VermietungController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(VermietungService) private readonly vermietungService: VermietungService) {}

  @Get(':jahr/vermietung')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: VermietungResponseDto, description: 'The caller’s Vermietung objects + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<VermietungResponseDto> {
    return this.vermietungService.getState(userId, jahr)
  }

  @Post(':jahr/vermietung/objekte')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiCreatedResponse({ type: VermietungResponseDto, description: 'A fresh object (all fields offen) was created; the response carries the updated list + fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  create(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<VermietungResponseDto> {
    return this.vermietungService.createObjekt(userId, jahr)
  }

  @Put(':jahr/vermietung/objekte/:objektId/:feld')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiParam({ name: 'objektId', type: String, example: '9c3f…', description: 'The object id (assigned by POST …/objekte).' })
  @ApiParam({
    name: 'feld',
    type: String,
    example: 'mieteinnahmen',
    description: 'One of mieteinnahmen | anschaffungskosten | baujahr | werbungskosten (ParseVermietungFeldPipe).',
  })
  @ApiBody({ type: PutVermietungFeldDto })
  @ApiOkResponse({ type: VermietungResponseDto, description: 'The updated objects and their derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setFeld(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('objektId') objektId: string,
    @Param('feld', ParseVermietungFeldPipe) feld: Parameters<VermietungService['setFeld']>[3],
    @Body() dto: PutVermietungFeldDto,
  ): Promise<VermietungResponseDto> {
    return this.vermietungService.setFeld(userId, jahr, objektId, feld, dto)
  }
}
