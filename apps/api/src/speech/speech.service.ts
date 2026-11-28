import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { TooManyRequestsError, UnavailableError } from '../common/domain-error.js'
import { SPEECH_PORT, SpeechProviderError, type SpeechPort, type SpeechRequest, type SpokenAudio } from './speech.port.js'

export const SPEECH_ENV_SOURCE = Symbol('SPEECH_ENV_SOURCE')

/** Speech calls a day across all users: a ceiling on the bill, far above ordinary use (ADR-0115). */
export const DEFAULT_SPEECH_DAILY_CALL_LIMIT = 20_000

@Injectable()
export class SpeechService {
  private readonly logger = new Logger('Speech')
  private readonly env: Readonly<Record<string, string | undefined>>

  constructor(
    @Inject(SPEECH_PORT) private readonly port: SpeechPort,
    @Optional() @Inject(BETTER_AUTH_BUNDLE) private readonly shared?: Pick<BetterAuthBundle, 'rateLimitStorage'>,
    @Optional() @Inject(SPEECH_ENV_SOURCE) env?: Readonly<Record<string, string | undefined>>,
  ) {
    this.env = env ?? process.env
  }

  get available(): boolean {
    return this.port.available
  }

  async speak(request: SpeechRequest, signal?: AbortSignal): Promise<SpokenAudio> {
    if (!this.port.available) throw new UnavailableError('SPEECH_UNAVAILABLE', 'Die Stimme der Eule ist hier nicht eingerichtet.')
    if (!(await this.takeDailyCall())) throw new TooManyRequestsError('SPEECH_BUDGET_SPENT', 'Die Stimme der Eule ist für heute aufgebraucht.')
    try {
      return await this.port.speak(request, signal)
    } catch (error) {
      // The reason and status only: the provider's own text may quote what was to be spoken.
      this.logger.warn(error instanceof SpeechProviderError ? error.message : 'speech provider: failed')
      throw new UnavailableError('SPEECH_FAILED', 'Die Stimme der Eule ist gerade nicht erreichbar.')
    }
  }

  private async takeDailyCall(): Promise<boolean> {
    if (!this.shared) return true
    const parsed = Number.parseInt(this.env.AI_SPEECH_DAILY_CALL_LIMIT?.trim() ?? '', 10)
    const max = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000_000) : DEFAULT_SPEECH_DAILY_CALL_LIMIT
    try {
      return (await this.shared.rateLimitStorage.consume(`speech-calls:${new Date().toISOString().slice(0, 10)}`, { window: 24 * 60 * 60, max })).allowed
    } catch {
      // The counter must never take the voice down with it.
      return true
    }
  }
}
