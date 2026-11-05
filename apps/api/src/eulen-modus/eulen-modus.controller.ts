import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { OwlModeService } from './eulen-modus.service.js'
import {
  EulenEinstellungResponseDto,
  EulenKartenResponseDto,
  SetEulenEinstellungDto,
} from './dto/eulen-modus.dto.js'

@ApiTags('eulen-modus')
@Controller('v1')
@UseGuards(UserContextGuard)
export class EulenModusController {
  constructor(@Inject(OwlModeService) private readonly service: OwlModeService) {}

  @Get('eulen-modus/einstellung')
  @RequiresAccount()
  @ApiOkResponse({ type: EulenEinstellungResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  getEinstellung(@CurrentUser() userId: string): Promise<EulenEinstellungResponseDto> {
    return this.service.getEinstellung(userId)
  }

  @Put('eulen-modus/einstellung')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiBody({ type: SetEulenEinstellungDto })
  @ApiOkResponse({ type: EulenEinstellungResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  setEinstellung(
    @CurrentUser() userId: string,
    @Body() dto: SetEulenEinstellungDto,
  ): Promise<EulenEinstellungResponseDto> {
    return this.service.setEinstellung(userId, dto.aktiviert)
  }

  @Get('steuerjahre/:jahr/eulen-karten')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: EulenKartenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  getKarten(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
  ): Promise<EulenKartenResponseDto> {
    return this.service.getKarten(userId, jahr)
  }

  @Post('steuerjahre/:jahr/eulen-karten/:fingerprint/verwerfen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'fingerprint', type: String, example: '1234abcd5678efgh' })
  @ApiOkResponse({ description: 'Card successfully dismissed.' })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  async verwerfeKarte(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Param('fingerprint') fingerprint: string,
  ): Promise<{ status: string }> {
    await this.service.verwerfeKarte(userId, jahr, fingerprint)
    return { status: 'ok' }
  }
}
