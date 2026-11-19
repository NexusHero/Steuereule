import { Body, Controller, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { FiledElsewhereResponseDto, PutFiledElsewhereDto } from './dto/year-history-insights.dto.js'
import { YearHistoryResponseDto } from './dto/year-history.dto.js'
import { toYearHistoryDto } from './year-history.mapper.js'
import { YearHistoryService } from './year-history.service.js'

@ApiTags('verlauf')
@Controller('v1/verlauf')
@UseGuards(UserContextGuard)
export class YearHistoryController {
  constructor(@Inject(YearHistoryService) private readonly service: YearHistoryService) {}

  @Get()
  @RequiresAccount()
  @ApiOkResponse({ type: YearHistoryResponseDto, description: 'Steuer-Verlauf (ADR-0098, ADR-0099): every year of the caller’s account or household, with the Bescheid-Abgleich, „Was ansteht“, the hints, events, groups and Unterlagen.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async get(@CurrentUser() userId: string): Promise<YearHistoryResponseDto> {
    return toYearHistoryDto(await this.service.get(userId))
  }
}

/** „Schon abgegeben?“ (ADR-0099 §1) lives on the tax year, next to the Abgabe of ADR-0098. */
@ApiTags('verlauf')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class FiledElsewhereController {
  constructor(@Inject(YearHistoryService) private readonly service: YearHistoryService) {}

  @Put(':jahr/abgabe-anderswo')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2022, description: 'A year of the Festsetzungsfrist without data in the app.' })
  @ApiBody({ type: PutFiledElsewhereDto })
  @ApiOkResponse({ type: FiledElsewhereResponseDto, description: 'The stored answer and the state it put the year in.' })
  @ApiBadRequestResponse({ description: 'The year is outside the four years a return can still be filed for.' })
  @ApiConflictResponse({ description: 'The year already has data in the app.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async answer(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: PutFiledElsewhereDto): Promise<FiledElsewhereResponseDto> {
    const result = await this.service.answerFiledElsewhere(userId, year, dto.answer)
    return { year: result.year, status: result.status, filedElsewhere: { ...result.filedElsewhere }, deadline: { ...result.deadline } }
  }
}
