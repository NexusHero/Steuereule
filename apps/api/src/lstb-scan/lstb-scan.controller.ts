import { Body, Controller, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { LinkService } from '../link/link.service.js'
import { ParsePersonPipe } from '../link/parse-person.pipe.js'
import { LstbResponseDto } from '../lstb/dto/lstb-response.dto.js'
import { ConfirmLstbScanDto } from './dto/confirm-lstb-scan.dto.js'
import { LstbScanService } from './lstb-scan.service.js'

@ApiTags('lstb')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class LstbScanController {
  constructor(
    @Inject(LinkService) private readonly link: LinkService,
    @Inject(LstbScanService) private readonly scanService: LstbScanService,
  ) {}

  @Put(':jahr/lstb')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: ConfirmLstbScanDto })
  @ApiOkResponse({ type: LstbResponseDto, description: 'Atomically saves confirmed LStB values with Beleg provenance.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  @ApiQuery({
    name: 'person',
    required: false,
    enum: ['A', 'B'],
    description: 'B: Person A records the figures of a partner without an own account (ADR-0054).',
  })
  async confirmScan(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: ConfirmLstbScanDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B',
  ): Promise<LstbResponseDto> {
    return this.scanService.confirm(userId, await this.link.dataUser(userId, year, person), year, dto)
  }
}
