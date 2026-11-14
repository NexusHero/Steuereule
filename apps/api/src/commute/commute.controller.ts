import { Body, Controller, Get, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { LinkService } from '../link/link.service.js'
import { ParsePersonPipe } from '../link/parse-person.pipe.js'
import { CommuteService } from './commute.service.js'
import { WAY_TEXT_FIELDS, WORK_EXPENSE_AMOUNT_FIELDS, WORK_EXPENSE_NOTE_FIELDS } from './commute.repository.js'
import { CommuteInputsDto, CommuteResponseDto } from './dto/commute.dto.js'

@ApiTags('arbeitsweg')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class CommuteController {
  constructor(
    @Inject(LinkService) private readonly link: LinkService,
    @Inject(CommuteService) private readonly service: CommuteService,
  ) {}

  @Get(':jahr/arbeitsweg')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: CommuteResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A reads the commute of a partner without an own account (ADR-0054).' })
  async get(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<CommuteResponseDto> {
    return this.service.getState(await this.link.dataUser(userId, year, person), year)
  }

  @Put(':jahr/arbeitsweg')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiBody({ type: CommuteInputsDto })
  @ApiOkResponse({ type: CommuteResponseDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: Person A records the commute of a partner without an own account (ADR-0054).' })
  async put(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() body: CommuteInputsDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<CommuteResponseDto> {
    return this.service.save(await this.link.dataUser(userId, year, person), year, {
      workdays: body.workdays,
      vacationDays: body.vacationDays,
      sickDays: body.sickDays,
      homeOfficeDays: body.homeOfficeDays,
      oneWayKm: body.oneWayKm ?? null,
      transport: body.transport ?? null,
      workplace: body.workplace?.trim() || null,
      publicHolidays: body.publicHolidays ?? null,
      publicHolidayRegion: body.publicHolidayRegion ?? null,
      // Absent fields stay undefined so a save from an older client keeps what is stored.
      ...pick(body, [...WORK_EXPENSE_AMOUNT_FIELDS, ...WORK_EXPENSE_NOTE_FIELDS, ...WAY_TEXT_FIELDS, 'secondOneWayKm']),
    })
  }
}

/** The listed fields the client sent (null included), leaving out what it did not send. */
function pick<T extends object, K extends keyof T>(body: T, fields: readonly K[]): Partial<Pick<T, K>> {
  return Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]])) as Partial<Pick<T, K>>
}
