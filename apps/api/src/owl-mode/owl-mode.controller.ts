import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { OwlModeService } from './owl-mode.service.js'
import { PersonalDataConsentService } from './personal-data-consent.service.js'
import {
  OwlSettingResponseDto,
  OwlCardsResponseDto,
  PersonalDataConsentResponseDto,
  SetOwlSettingDto,
  SetPersonalDataConsentDto,
} from './dto/owl-mode.dto.js'

@ApiTags('eulen-modus')
@Controller('v1')
@UseGuards(UserContextGuard)
export class OwlModeController {
  constructor(
    @Inject(OwlModeService) private readonly service: OwlModeService,
    @Inject(PersonalDataConsentService) private readonly consent: PersonalDataConsentService,
  ) {}

  @Get('eulen-modus/personendaten-einwilligung')
  @RequiresAccount()
  @ApiOkResponse({ type: PersonalDataConsentResponseDto, description: 'Whether personal data may go to the owl\'s language model (ADR-0091).' })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  getPersonalDataConsent(@CurrentUser() userId: string): Promise<PersonalDataConsentResponseDto> {
    return this.consent.state(userId)
  }

  /** Only the user gives or revokes it, never an assistant acting for them. */
  @Put('eulen-modus/personendaten-einwilligung')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiBody({ type: SetPersonalDataConsentDto })
  @ApiOkResponse({ type: PersonalDataConsentResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  setPersonalDataConsent(@CurrentUser() userId: string, @Body() dto: SetPersonalDataConsentDto): Promise<PersonalDataConsentResponseDto> {
    return this.consent.set(userId, dto.granted)
  }

  @Get('eulen-modus/einstellung')
  @RequiresAccount()
  @ApiOkResponse({ type: OwlSettingResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  getSetting(@CurrentUser() userId: string): Promise<OwlSettingResponseDto> {
    return this.service.getSetting(userId)
  }

  @Put('eulen-modus/einstellung')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @ApiBody({ type: SetOwlSettingDto })
  @ApiOkResponse({ type: OwlSettingResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  setSetting(
    @CurrentUser() userId: string,
    @Body() dto: SetOwlSettingDto,
  ): Promise<OwlSettingResponseDto> {
    return this.service.setSetting(userId, dto.enabled)
  }

  @Get('steuerjahre/:jahr/eulen-karten')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiOkResponse({ type: OwlCardsResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  getCards(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
  ): Promise<OwlCardsResponseDto> {
    return this.service.getCards(userId, year)
  }

  @Post('steuerjahre/:jahr/eulen-karten/:fingerprint/verwerfen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025 })
  @ApiParam({ name: 'fingerprint', type: String, example: '1234abcd5678efgh' })
  @ApiOkResponse({ description: 'Card successfully dismissed.' })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  async dismissCard(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('fingerprint') fingerprint: string,
  ): Promise<{ status: string }> {
    await this.service.dismissCard(userId, year, fingerprint)
    return { status: 'ok' }
  }
}
