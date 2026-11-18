import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
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
  @ApiOkResponse({ type: YearHistoryResponseDto, description: 'Steuer-Verlauf (ADR-0098): every year of the caller’s account or household, with the Bescheid-Abgleich and „Was ansteht“.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async get(@CurrentUser() userId: string): Promise<YearHistoryResponseDto> {
    return toYearHistoryDto(await this.service.get(userId))
  }
}
