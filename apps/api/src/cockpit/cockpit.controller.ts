import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, ApiParam, ApiTags, getSchemaPath } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { CockpitStatusDto, CockpitSummaryDto } from './dto/cockpit-summary.dto.js'
import { CockpitService } from './cockpit.service.js'
import { ParseTaxYearPipe } from './parse-steuerjahr.pipe.js'

@ApiTags('cockpit')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class CockpitController {
  constructor(@Inject(CockpitService) private readonly cockpitService: CockpitService) {}

  @Get(':jahr/cockpit')
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) to summarize — validated to a sensible window (2000..currentYear+1), never just "parses as a number".',
  })
  @ApiExtraModels(CockpitSummaryDto, CockpitStatusDto)
  @ApiOkResponse({
    description:
      'The caller’s Cockpit summary for the given tax year, or null when nothing has been seeded/entered yet for it (the honest empty state, not a 404).',
    schema: { allOf: [{ $ref: getSchemaPath(CockpitSummaryDto) }], nullable: true },
  })
  getCockpitSummary(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
  ): Promise<CockpitSummaryDto | null> {
    return this.cockpitService.getSummary(userId, year)
  }
}
