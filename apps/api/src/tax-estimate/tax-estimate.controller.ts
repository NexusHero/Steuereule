import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { TaxEstimateDto } from './dto/tax-estimate.dto.js'
import { TaxEstimateService } from './tax-estimate.service.js'

@ApiTags('steuerschaetzung')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class TaxEstimateController {
  constructor(@Inject(TaxEstimateService) private readonly service: TaxEstimateService) {}

  @Get(':jahr/steuerschaetzung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: TaxEstimateDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<TaxEstimateDto> {
    const status = await this.service.getState(userId, year)
    // The breakdown is for explaining the estimate to an assistant (ADR-0052 amendment 3), not part of this contract.
    const { breakdown: _breakdown, ...figures } = status as typeof status & { breakdown?: unknown }
    return { ...figures, ...('missing' in status ? { missing: [...status.missing] } : {}) } as TaxEstimateDto
  }
}
