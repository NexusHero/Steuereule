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
import { AssessmentService } from './bescheid.service.js'
import { ParseBescheidFeldPipe } from './parse-bescheid-feld.pipe.js'
import { PutAssessmentFieldDto } from './dto/bescheid-feld.dto.js'
import {
  AssessmentResponseDto,
  SetAssessmentDateDto,
  SetBescheidStatusDto,
  SetAppealDto,
} from './dto/bescheid-response.dto.js'

@ApiTags('bescheid')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class BescheidController {
  constructor(@Inject(AssessmentService) private readonly service: AssessmentService) {}

  @Get(':jahr/bescheid')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The caller’s Bescheid — re-entry (fields + Abgleich + Frist).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<AssessmentResponseDto> {
    return this.service.getState(userId, jahr)
  }

  @Put(':jahr/bescheid/feld/:feld')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiParam({ name: 'feld', type: String, example: 'einnahmen', description: 'One of the five Bescheid figures (ParseBescheidFeldPipe).' })
  @ApiBody({ type: PutAssessmentFieldDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The updated Bescheid and its derived Abgleich + Frist.' })
  setFeld(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('feld', ParseBescheidFeldPipe) feld: Parameters<AssessmentService['setFeld']>[2],
    @Body() dto: PutAssessmentFieldDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setFeld(userId, jahr, feld, dto)
  }

  @Put(':jahr/bescheid/datum')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetAssessmentDateDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The updated Bescheid (Bescheiddatum + Frist).' })
  setDatum(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: SetAssessmentDateDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setDatum(userId, jahr, dto)
  }

  @Put(':jahr/bescheid/status')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetBescheidStatusDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The Bescheid after the validated transition.' })
  setStatus(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: SetBescheidStatusDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setStatus(userId, jahr, dto)
  }

  @Put(':jahr/bescheid/einspruch')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetAppealDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The Bescheid after filing the Einspruch (validated transition).' })
  setEinspruch(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: SetAppealDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setEinspruch(userId, jahr, dto)
  }
}
