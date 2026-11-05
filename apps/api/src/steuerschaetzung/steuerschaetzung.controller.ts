import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { SteuerschaetzungDto } from './dto/steuerschaetzung.dto.js'
import { SteuerschaetzungService } from './steuerschaetzung.service.js'

@ApiTags('steuerschaetzung')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class SteuerschaetzungController {
  constructor(@Inject(SteuerschaetzungService) private readonly service: SteuerschaetzungService) {}

  @Get(':jahr/steuerschaetzung')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: SteuerschaetzungDto })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async get(@CurrentUser() userId: string, @Param('jahr', ParseSteuerjahrPipe) jahr: number): Promise<SteuerschaetzungDto> {
    const stand = await this.service.getState(userId, jahr)
    return { ...stand, ...('fehlt' in stand ? { fehlt: [...stand.fehlt] } : {}) } as SteuerschaetzungDto
  }
}
