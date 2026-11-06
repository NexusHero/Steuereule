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
import { ParseTaxYearPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { ParseRentalFieldPipe } from './parse-vermietung-feld.pipe.js'
import { RentalService } from './vermietung.service.js'
import { PutRentalFieldDto } from './dto/vermietung-feld.dto.js'
import { PutRentalAddressDto } from './dto/vermietung-adresse.dto.js'
import { RentalResponseDto } from './dto/vermietung-response.dto.js'

@ApiTags('vermietung')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class RentalController {
  constructor(@Inject(RentalService) private readonly rentalService: RentalService) {}

  @Get(':jahr/vermietung')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: RentalResponseDto, description: 'The caller’s Vermietung objects + fold for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<RentalResponseDto> {
    return this.rentalService.getState(userId, year)
  }

  @Post(':jahr/vermietung/objekte')
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiCreatedResponse({ type: RentalResponseDto, description: 'A fresh object (all fields offen) was created; the response carries the updated list + fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  create(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<RentalResponseDto> {
    return this.rentalService.createProperty(userId, year)
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
  @ApiBody({ type: PutRentalFieldDto })
  @ApiOkResponse({ type: RentalResponseDto, description: 'The updated objects and their derived fold.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('objektId') propertyId: string,
    @Param('feld', ParseRentalFieldPipe) field: Parameters<RentalService['setField']>[3],
    @Body() dto: PutRentalFieldDto,
  ): Promise<RentalResponseDto> {
    return this.rentalService.setField(userId, year, propertyId, field, dto)
  }

  @Put(':jahr/vermietung/objekte/:objektId/adresse')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026 })
  @ApiParam({ name: 'objektId', type: String, example: '9c3f…' })
  @ApiBody({ type: PutRentalAddressDto })
  @ApiOkResponse({ type: RentalResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  setAddress(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('objektId') propertyId: string,
    @Body() dto: PutRentalAddressDto,
  ): Promise<RentalResponseDto> {
    return this.rentalService.setAddress(userId, year, propertyId, dto)
  }
}
