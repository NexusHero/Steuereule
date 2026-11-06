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
import { ParseTaxYearPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ParsePensionFieldPipe } from './parse-rente-feld.pipe.js'
import { PensionService } from './rente.service.js'
import { PutPensionFieldDto } from './dto/rente-feld.dto.js'
import { PutPensionKindDto } from './dto/rente-art.dto.js'
import { PensionResponseDto } from './dto/rente-response.dto.js'

@ApiTags('rente')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class PensionController {
  constructor(@Inject(PensionService) private readonly pensionService: PensionService) {}

  @Get(':jahr/rente')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: PensionResponseDto, description: 'The caller’s Rentner mask + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<PensionResponseDto> {
    return this.pensionService.getState(userId, year)
  }

  @Put(':jahr/rente/art')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: PutPensionKindDto })
  @ApiOkResponse({ type: PensionResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setPensionKind(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PutPensionKindDto,
  ): Promise<PensionResponseDto> {
    return this.pensionService.setPensionKind(userId, year, dto)
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
  @ApiBody({ type: PutPensionFieldDto })
  @ApiOkResponse({ type: PensionResponseDto, description: 'The updated mask and its derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('feld', ParsePensionFieldPipe) field: Parameters<PensionService['setField']>[2],
    @Body() dto: PutPensionFieldDto,
  ): Promise<PensionResponseDto> {
    return this.pensionService.setField(userId, year, field, dto)
  }
}
