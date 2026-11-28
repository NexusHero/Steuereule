import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { SPEECH_LANGUAGES, type SpeechLanguage } from '../speech.port.js'

/** One passage: the app sends an answer sentence by sentence, so the first words play while the rest is still made. */
export const SPEECH_TEXT_MAX_CHARS = 600

export class SpeakDto {
  @ApiProperty({ type: String, maxLength: SPEECH_TEXT_MAX_CHARS, example: 'Daraus ergibt sich eine Entfernungspauschale von rund 3.030 Euro.', description: 'The passage to speak, as plain text without Markdown.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SPEECH_TEXT_MAX_CHARS)
  text!: string

  @ApiProperty({ type: String, enum: SPEECH_LANGUAGES, example: 'de' })
  @IsIn(SPEECH_LANGUAGES)
  language!: SpeechLanguage
}

/** One utterance: 60 seconds of 16-bit mono at 16 kHz, with room for the header. */
export const HEARD_AUDIO_MAX_BYTES = 2 * 1024 * 1024

export class TranscriptDto {
  @ApiProperty({ type: String, example: 'Ich bin 38 Kilometer zur Arbeit gefahren.', description: 'The words of the recording; empty when nothing was said.' })
  text!: string
}
