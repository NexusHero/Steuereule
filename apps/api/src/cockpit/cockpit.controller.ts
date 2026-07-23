import { Controller, Get, Inject, Param, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, ApiParam, ApiTags, getSchemaPath } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { CockpitSummaryDto, EstimateRangeDto } from './dto/cockpit-summary.dto.js'
import { CockpitService } from './cockpit.service.js'

@ApiTags('cockpit')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class CockpitController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(CockpitService) private readonly cockpitService: CockpitService) {}

  @Get(':jahr/cockpit')
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr) to summarize.' })
  // ApiExtraModels + a raw `schema` (rather than plain `type: CockpitSummaryDto`):
  // the response can genuinely be the JSON literal `null` — "no tax year yet", the
  // honest empty state (REQ-001), never a 404/204 — and @nestjs/swagger's `type:`
  // shorthand has no way to express "this DTO, or null" for OpenAPI 3.0, which
  // disallows sibling keywords (like `nullable`) directly next to a bare `$ref`.
  // `allOf: [$ref]` is the standard indirection that makes `nullable: true` legal
  // alongside it, and ApiExtraModels registers CockpitSummaryDto's schema so
  // getSchemaPath can reference it here.
  @ApiExtraModels(CockpitSummaryDto, EstimateRangeDto)
  @ApiOkResponse({
    description:
      'The caller’s Cockpit summary for the given tax year, or null when nothing has been seeded/entered yet for it (the honest empty state, not a 404).',
    schema: { allOf: [{ $ref: getSchemaPath(CockpitSummaryDto) }], nullable: true },
  })
  getCockpitSummary(
    @CurrentUser() userId: string,
    @Param('jahr', ParseIntPipe) jahr: number,
  ): Promise<CockpitSummaryDto | null> {
    return this.cockpitService.getSummary(userId, jahr)
  }
}
