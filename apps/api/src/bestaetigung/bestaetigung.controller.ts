import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { ANNEXES, type Annex } from '@steuereule/core'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ConfirmationService } from './bestaetigung.service.js'
import { ConfirmationResponseDto, ProposalDecisionDto } from './dto/bestaetigung.dto.js'

const JAHR_PARAM = { name: 'jahr', type: Number, example: 2025, description: 'The tax year (ParseSteuerjahrPipe, same as Cockpit).' }

@ApiTags('bestaetigung')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class BestaetigungController {
  constructor(@Inject(ConfirmationService) private readonly service: ConfirmationService) {}

  @Get(':jahr/bestaetigung')
  @RequiresAccount()
  @ApiParam(JAHR_PARAM)
  @ApiOkResponse({ type: ConfirmationResponseDto, description: 'Per Anlage: the unconfirmed values and open proposals, with their Herkunft.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<ConfirmationResponseDto> {
    return this.service.uebersicht(userId, jahr)
  }

  @Put(':jahr/bestaetigung/anlagen/:anlage')
  @RequiresAccount()
  @ApiParam(JAHR_PARAM)
  @ApiParam({ name: 'anlage', type: String, enum: ANNEXES })
  @ApiOkResponse({ type: ConfirmationResponseDto, description: 'All values of the Anlage are confirmed; the remaining overview.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  bestaetigeAnlage(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('anlage') anlage: string,
  ): Promise<ConfirmationResponseDto> {
    return this.service.bestaetigeAnlage(userId, jahr, anlage as Annex)
  }

  @Put(':jahr/bestaetigung/vorschlaege/:key')
  @RequiresAccount()
  @ApiParam(JAHR_PARAM)
  @ApiParam({ name: 'key', type: String, example: 'lstb.bruttoarbeitslohn' })
  @ApiBody({ type: ProposalDecisionDto })
  @ApiOkResponse({ type: ConfirmationResponseDto, description: 'The proposal was accepted (written, confirmed) or discarded.' })
  @ApiNotFoundResponse({ description: 'No open proposal for this field.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  entscheideVorschlag(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('key') key: string,
    @Body() body: ProposalDecisionDto,
  ): Promise<ConfirmationResponseDto> {
    return this.service.entscheideVorschlag(userId, jahr, key, body.entscheidung)
  }
}
