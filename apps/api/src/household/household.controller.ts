import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { AdoptChildrenDto, AnswerCandidateDto, HouseholdResponseDto } from './dto/household.dto.js'
import { HouseholdService } from './household.service.js'

/** Household at account level (#452, ADR-0062). */
@ApiTags('haushalt')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class HouseholdController {
  constructor(@Inject(HouseholdService) private readonly household: HouseholdService) {}

  @Get(':jahr/haushalt')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026 })
  @ApiOkResponse({ type: HouseholdResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<HouseholdResponseDto> {
    return this.household.view(userId, year) as Promise<HouseholdResponseDto>
  }

  @Post(':jahr/haushalt/kinder/uebernehmen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026 })
  @ApiBody({ type: AdoptChildrenDto })
  @ApiOkResponse({ type: HouseholdResponseDto })
  adoptChildren(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: AdoptChildrenDto): Promise<HouseholdResponseDto> {
    return this.household.adoptChildren(userId, year, dto.personIds) as Promise<HouseholdResponseDto>
  }

  @Post(':jahr/haushalt/personen/:personId/nicht-mehr-dabei')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The first year without the person.' })
  @ApiParam({ name: 'personId', type: String })
  @ApiOkResponse({ type: HouseholdResponseDto })
  leave(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Param('personId') personId: string): Promise<HouseholdResponseDto> {
    return this.household.leaveFromYear(userId, personId, year) as Promise<HouseholdResponseDto>
  }

  @Post(':jahr/haushalt/partner/nicht-mehr-dabei')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The first year without the spouse link.' })
  @ApiOkResponse({ type: HouseholdResponseDto })
  endPartner(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<HouseholdResponseDto> {
    return this.household.endPartnerLink(userId, year) as Promise<HouseholdResponseDto>
  }

  @Delete(':jahr/haushalt/personen/:personId')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026 })
  @ApiParam({ name: 'personId', type: String })
  @ApiOkResponse({ type: HouseholdResponseDto })
  delete(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Param('personId') personId: string): Promise<HouseholdResponseDto> {
    return this.household.deletePerson(userId, personId, year) as Promise<HouseholdResponseDto>
  }

  @Post(':jahr/haushalt/dubletten/:id')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026 })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: AnswerCandidateDto })
  @ApiOkResponse({ type: HouseholdResponseDto })
  answer(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Param('id') id: string, @Body() dto: AnswerCandidateDto): Promise<HouseholdResponseDto> {
    return this.household.answerCandidate(userId, id, dto.same, year) as Promise<HouseholdResponseDto>
  }
}
