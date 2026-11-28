export type SpeechProviderKind = 'google-genai' | 'fake' | 'off'

export interface SpeechConfig {
  readonly provider: SpeechProviderKind
  readonly model: string
  readonly voice: string
  readonly apiKey: string | null
  readonly timeoutMs: number
}

export const DEFAULT_SPEECH_MODEL = 'gemini-3.8-flash-tts'
/** The warm voice chosen by ear for the owl (ADR-0115). */
export const DEFAULT_SPEECH_VOICE = 'Sulafat'
export const DEFAULT_SPEECH_TIMEOUT_MS = 20_000

const OFF: SpeechConfig = { provider: 'off', model: DEFAULT_SPEECH_MODEL, voice: DEFAULT_SPEECH_VOICE, apiKey: null, timeoutMs: DEFAULT_SPEECH_TIMEOUT_MS }

const isOn = (raw: string | undefined): boolean => ['1', 'true', 'yes', 'on'].includes(raw?.trim().toLowerCase() ?? '')

/**
 * The voice is off until AI_SPEECH_PROVIDER names a provider: a key that is there for the chat does not
 * switch on a second flow of answer text to that provider by itself (ADR-0115).
 */
export function resolveSpeechConfig(env: Readonly<Record<string, string | undefined>> = process.env): SpeechConfig {
  if (isOn(env.AI_KILL_SWITCH)) return OFF
  // CI and tests hear the scripted voice; production refuses AI_FAKE_KI at startup.
  if (isOn(env.AI_FAKE_KI) && env.NODE_ENV !== 'production') return { ...OFF, provider: 'fake' }
  if (env.AI_SPEECH_PROVIDER?.trim().toLowerCase() !== 'google-genai') return OFF
  const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || null
  if (!apiKey) return OFF
  return {
    provider: 'google-genai',
    model: env.AI_SPEECH_MODEL?.trim() || DEFAULT_SPEECH_MODEL,
    voice: env.AI_SPEECH_VOICE?.trim() || DEFAULT_SPEECH_VOICE,
    apiKey,
    timeoutMs: DEFAULT_SPEECH_TIMEOUT_MS,
  }
}
