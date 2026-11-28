import { Module } from '@nestjs/common'
import { FakeSpeech, NoSpeech } from './fake-speech.js'
import { GeminiSpeech } from './gemini-speech.js'
import { MistralSpeech } from './mistral-speech.js'
import { resolveSpeechConfig } from './speech-config.js'
import { SpeechController } from './speech.controller.js'
import { SPEECH_PORT, type SpeechPort } from './speech.port.js'
import { SpeechService } from './speech.service.js'

export function createSpeechPort(env: Readonly<Record<string, string | undefined>> = process.env): SpeechPort {
  const config = resolveSpeechConfig(env)
  if (config.provider === 'fake') return new FakeSpeech()
  if (config.apiKey === null) return new NoSpeech()
  if (config.provider === 'google-genai') return new GeminiSpeech({ ...config, apiKey: config.apiKey })
  if (config.provider === 'mistral') return new MistralSpeech({ ...config, apiKey: config.apiKey })
  return new NoSpeech()
}

@Module({
  controllers: [SpeechController],
  providers: [{ provide: SPEECH_PORT, useFactory: () => createSpeechPort() }, SpeechService],
  exports: [SpeechService],
})
export class SpeechModule {}
