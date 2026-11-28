import type { SpeechLanguage } from './speech.port.js'

export const SPEECH_PROVIDERS = ['google-genai', 'mistral'] as const
export type SpeechProviderName = (typeof SPEECH_PROVIDERS)[number]
export type SpeechProviderKind = SpeechProviderName | 'fake' | 'off'

export interface SpeechConfig {
  readonly provider: SpeechProviderKind
  readonly model: string
  /** The voice per language: one voice speaks every language with Gemini, one language only with Mistral. */
  readonly voices: Readonly<Record<SpeechLanguage, string>>
  readonly apiKey: string | null
  readonly timeoutMs: number
}

interface ProviderDefaults {
  readonly model: string
  readonly voices: Readonly<Record<SpeechLanguage, string>>
}

/** Sulafat: the warm voice chosen by ear for the owl. Heidi (voice_481): Mistral's one German preset; Margaret for English. */
export const SPEECH_DEFAULTS: Readonly<Record<SpeechProviderName, ProviderDefaults>> = {
  'google-genai': { model: 'gemini-3.8-flash-tts', voices: { de: 'Sulafat', en: 'Sulafat' } },
  mistral: { model: 'voxtral-mini-tts-3-0', voices: { de: 'voice_481', en: 'voice_447' } },
}

export const DEFAULT_SPEECH_TIMEOUT_MS = 20_000

const OFF: SpeechConfig = { provider: 'off', model: '', voices: { de: '', en: '' }, apiKey: null, timeoutMs: DEFAULT_SPEECH_TIMEOUT_MS }

const isOn = (raw: string | undefined): boolean => ['1', 'true', 'yes', 'on'].includes(raw?.trim().toLowerCase() ?? '')

/** Each provider reads its own key and no other. */
function keyOf(provider: SpeechProviderName, env: Readonly<Record<string, string | undefined>>): string | null {
  if (provider === 'mistral') return env.MISTRAL_API_KEY?.trim() || null
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || null
}

const providerOf = (raw: string | undefined): SpeechProviderName | null => SPEECH_PROVIDERS.find((name) => name === raw?.trim().toLowerCase()) ?? null

/**
 * The voice is off until AI_SPEECH_PROVIDER names a provider: a key that is there for the chat does not
 * switch on a second flow of answer text to that provider by itself (ADR-0115). The speech provider is
 * independent of the chat model.
 */
export function resolveSpeechConfig(env: Readonly<Record<string, string | undefined>> = process.env): SpeechConfig {
  if (isOn(env.AI_KILL_SWITCH)) return OFF
  // CI and tests hear the scripted voice; production refuses AI_FAKE_KI at startup.
  if (isOn(env.AI_FAKE_KI) && env.NODE_ENV !== 'production') return { ...OFF, provider: 'fake' }
  const provider = providerOf(env.AI_SPEECH_PROVIDER)
  if (provider === null) return OFF
  const defaults = SPEECH_DEFAULTS[provider]
  const apiKey = keyOf(provider, env)
  if (!apiKey) return OFF
  const german = env.AI_SPEECH_VOICE?.trim() || defaults.voices.de
  return {
    provider,
    model: env.AI_SPEECH_MODEL?.trim() || defaults.model,
    // A German voice set by hand is a voice of that provider: with Gemini it speaks English too.
    voices: { de: german, en: env.AI_SPEECH_VOICE_EN?.trim() || (provider === 'google-genai' ? german : defaults.voices.en) },
    apiKey,
    timeoutMs: DEFAULT_SPEECH_TIMEOUT_MS,
  }
}
