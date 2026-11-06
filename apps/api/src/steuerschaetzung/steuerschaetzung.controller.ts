import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { TaxEstimateDto } from './dto/steuerschaetzung.dto.js'
import { TaxEstimateService } from './steuerschaetzung.service.js'

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
    return { ...status, ...('missing' in status ? { missing: [...status.missing] } : {}) } as TaxEstimateDto
  }
}
