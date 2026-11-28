import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiOkResponse, ApiPayloadTooLargeResponse, ApiOperation, ApiProduces, ApiServiceUnavailableResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { InvalidInputError, PayloadTooLargeError } from '../common/domain-error.js'
import { ForbidAssistant } from '../auth/forbid-assistant.guard.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { AccountThrottle, LISTEN_THROTTLE, SPEECH_THROTTLE } from '../rate-limit/rate-limit.js'
import { HEARD_AUDIO_MAX_BYTES, SpeakDto, TranscriptDto } from './dto/speech.dto.js'
import { SPEECH_LANGUAGES, type SpeechLanguage } from './speech.port.js'
import { isWav } from './wav.js'
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

  @Post('gehoert')
  @HttpCode(200)
  @RequiresAccount()
  @ForbidAssistant()
  @AccountThrottle(LISTEN_THROTTLE)
  @ApiOperation({ summary: 'The words of one recorded utterance (ADR-0115); the recording is not kept' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'language'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'The utterance as a WAV file, 16-bit mono, at most 60 seconds.' },
        language: { type: 'string', enum: [...SPEECH_LANGUAGES] },
      },
    },
  })
  @ApiOkResponse({ type: TranscriptDto })
  @ApiUnauthorizedResponse({ description: 'Requires account.' })
  @ApiPayloadTooLargeResponse({ description: 'The recording is longer than 60 seconds.' })
  @ApiTooManyRequestsResponse({ description: 'Too many utterances for this account, or the day\'s voice budget is spent.' })
  @ApiServiceUnavailableResponse({ description: 'No voice is configured, or its provider did not answer.' })
  async transcribe(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<TranscriptDto> {
    if (typeof req.isMultipart !== 'function' || !req.isMultipart()) throw new InvalidInputError('SPEECH_MULTIPART_REQUIRED', 'Erwartet die Aufnahme als multipart/form-data im Feld "file".')
    const part = await req.file({ limits: { fileSize: HEARD_AUDIO_MAX_BYTES, files: 1 } })
    if (!part) throw new InvalidInputError('SPEECH_FILE_MISSING', 'Keine Aufnahme im Feld "file" gefunden.')
    const wav = await part.toBuffer().catch((error: unknown) => {
      if ((error as { code?: unknown } | null)?.code === 'FST_REQ_FILE_TOO_LARGE') throw tooLong()
      throw error
    })
    if (part.file.truncated) throw tooLong()
    if (!isWav(wav)) throw new InvalidInputError('SPEECH_FILE_NOT_WAV', 'Die Aufnahme muss eine WAV-Datei sein.')
    const language = languageOf(part.fields)
    reply.header('Cache-Control', 'no-store')
    return { text: await this.service.transcribe({ wav, language }) }
  }
}

const tooLong = (): PayloadTooLargeError => new PayloadTooLargeError('SPEECH_FILE_TOO_LONG', 'Die Aufnahme ist länger als 60 Sekunden.')

/** The `language` field of the form; it has to be sent before the file. */
function languageOf(fields: unknown): SpeechLanguage {
  const entry = (fields as Record<string, unknown> | null | undefined)?.language
  const item = Array.isArray(entry) ? (entry[0] as unknown) : entry
  const value = item && typeof item === 'object' && 'value' in item ? (item as { value: unknown }).value : undefined
  const language = SPEECH_LANGUAGES.find((known) => known === value)
  if (language === undefined) throw new InvalidInputError('SPEECH_LANGUAGE_INVALID', `"language" muss eine von ${SPEECH_LANGUAGES.join(', ')} sein.`)
  return language
}
