import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { selfEmploymentEnabled } from '../config/self-employment.js'
import { AppCapabilitiesDto } from './dto/app-capabilities.dto.js'
import { runningTaxYear } from '../common/tax-year.js'
import { SpeechService } from '../speech/speech.service.js'

/**
 * The server switches the client must know before any year exists. The cockpit summary carries the same switch,
 * but it is null for a year nothing was entered for yet, which is exactly when the interview needs it (09b, CI).
 */
@ApiTags('capabilities')
@Controller('v1/capabilities')
export class CapabilitiesController {
  constructor(@Inject(SpeechService) private readonly speech: Pick<SpeechService, 'available'>) {}

  @Get()
  @ApiOkResponse({ type: AppCapabilitiesDto, description: 'The switches of this deployment; reachable without a session.' })
  getCapabilities(): AppCapabilitiesDto {
    return { selbststaendig: selfEmploymentEnabled(), runningTaxYear: runningTaxYear(), eulenStimme: this.speech.available }
  }
}
