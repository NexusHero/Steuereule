import { Body, Controller, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiOperation, ApiProduces, ApiServiceUnavailableResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { AccountThrottle, SPEECH_THROTTLE } from '../rate-limit/rate-limit.js'
import { SpeakDto } from './dto/speech.dto.js'
import { SpeechService } from './speech.service.js'

@ApiTags('eulen-modus')
@Controller('v1/eulen-modus')
@UseGuards(UserContextGuard)
export class SpeechController {
  constructor(@Inject(SpeechService) private readonly service: SpeechService) {}

  @Post('stimme')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @AccountThrottle(SPEECH_THROTTLE)
  @ApiOperation({ summary: 'Speak one passage of an answer with the owl\'s voice (ADR-0115)' })
  @ApiBody({ type: SpeakDto })
  @ApiProduces('audio/wav')
  @ApiOkResponse({ description: 'The passage as one WAV file.' })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  @ApiTooManyRequestsResponse({ description: 'Too many passages for this account, or the day\'s voice budget is spent.' })
  @ApiServiceUnavailableResponse({ description: 'No voice is configured, or its provider did not answer.' })
  async speak(@Body() dto: SpeakDto, @Res({ passthrough: true }) reply: FastifyReply): Promise<Buffer> {
    const audio = await this.service.speak({ text: dto.text, language: dto.language })
    // Spoken answer text: nothing between the API and the user's device may keep it.
    reply.header('Cache-Control', 'no-store')
    reply.type(audio.mimeType)
    return audio.bytes
  }
}
