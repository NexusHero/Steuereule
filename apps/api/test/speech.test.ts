// The owl's voice (ADR-0115): the setting that switches it on, the provider call, and what the service
// does when the provider fails or the day's budget is spent.
import { describe, expect, it, vi } from 'vitest'
import { TooManyRequestsError, UnavailableError } from '../src/common/domain-error.js'
import { FakeSpeech, NoSpeech } from '../src/speech/fake-speech.js'
import { GeminiSpeech, type Fetch } from '../src/speech/gemini-speech.js'
import { MistralSpeech } from '../src/speech/mistral-speech.js'
import { resolveSpeechConfig } from '../src/speech/speech-config.js'
import { createSpeechPort } from '../src/speech/speech.module.js'
import { SpeechProviderError } from '../src/speech/speech.port.js'
import { SpeechService } from '../src/speech/speech.service.js'
import { isWav, sampleRateOf, wavFromPcm } from '../src/speech/wav.js'

const KEY = 'speech-key'
const CONFIG = { provider: 'google-genai' as const, model: 'gemini-3.8-flash-tts', voices: { de: 'Sulafat', en: 'Sulafat' }, apiKey: KEY, timeoutMs: 1_000 }
const MISTRAL = { provider: 'mistral' as const, model: 'voxtral-mini-tts-3-0', voices: { de: 'voice_481', en: 'voice_447' }, apiKey: KEY, timeoutMs: 1_000 }
const pcm = Buffer.alloc(480, 1)
const answerWith = (inlineData: { data: string; mimeType: string }): Fetch => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData }] } }] }) }))

describe('the setting of the voice', () => {
  it('is off while no provider is named, even with a Gemini key for the chat', () => {
    expect(resolveSpeechConfig({ GEMINI_API_KEY: KEY }).provider).toBe('off')
    expect(createSpeechPort({ GEMINI_API_KEY: KEY }).available).toBe(false)
  })

  it('is on with a named provider and takes the chat key, the warm voice and the standard model', () => {
    expect(resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'google-genai', GEMINI_API_KEY: KEY })).toMatchObject({ provider: 'google-genai', apiKey: KEY, voices: { de: 'Sulafat', en: 'Sulafat' }, model: 'gemini-3.8-flash-tts' })
  })

  it('takes its own model and voice; a Gemini voice set for German speaks English too', () => {
    const config = resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'google-genai', GOOGLE_API_KEY: KEY, AI_SPEECH_MODEL: 'm', AI_SPEECH_VOICE: 'Charon' })
    expect(config).toMatchObject({ apiKey: KEY, model: 'm', voices: { de: 'Charon', en: 'Charon' } })
  })

  it('with Mistral takes the Mistral key and one voice per language, whatever the chat uses', () => {
    const config = resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'mistral', MISTRAL_API_KEY: 'm-key', GEMINI_API_KEY: KEY, AI_ADVISOR_PROVIDER: 'anthropic' })
    expect(config).toMatchObject({ provider: 'mistral', apiKey: 'm-key', model: 'voxtral-mini-tts-3-0', voices: { de: 'voice_481', en: 'voice_447' } })
    expect(createSpeechPort({ AI_SPEECH_PROVIDER: 'mistral', MISTRAL_API_KEY: 'm-key' })).toBeInstanceOf(MistralSpeech)
  })

  it('with Mistral a German voice set by hand leaves the English one alone, and each can be set', () => {
    expect(resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'mistral', MISTRAL_API_KEY: 'm-key', AI_SPEECH_VOICE: 'voice_9' }).voices).toEqual({ de: 'voice_9', en: 'voice_447' })
    expect(resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'mistral', MISTRAL_API_KEY: 'm-key', AI_SPEECH_VOICE_EN: 'voice_8' }).voices).toEqual({ de: 'voice_481', en: 'voice_8' })
  })

  it('does not take another provider\'s key: Mistral without a Mistral key is off', () => {
    expect(resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'mistral', GEMINI_API_KEY: KEY }).provider).toBe('off')
    expect(resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'elsewhere', GEMINI_API_KEY: KEY }).provider).toBe('off')
  })

  it('stays off with a provider but no key, and under the kill switch', () => {
    expect(resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'google-genai' }).provider).toBe('off')
    expect(resolveSpeechConfig({ AI_SPEECH_PROVIDER: 'google-genai', GEMINI_API_KEY: KEY, AI_KILL_SWITCH: 'on' }).provider).toBe('off')
  })

  it('is the scripted voice with AI_FAKE_KI, never in production', () => {
    expect(resolveSpeechConfig({ AI_FAKE_KI: '1' }).provider).toBe('fake')
    expect(resolveSpeechConfig({ AI_FAKE_KI: '1', NODE_ENV: 'production' }).provider).toBe('off')
  })
})

describe('the Gemini voice', () => {
  it('sends the passage alone with the voice, the key in a header and never in the URL', async () => {
    const fetchFn = answerWith({ data: pcm.toString('base64'), mimeType: 'audio/L16;codec=pcm;rate=24000' })
    await new GeminiSpeech(CONFIG, fetchFn).speak({ text: 'Rund 3.030 Euro.', language: 'de' })
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent')
    expect(url).not.toContain(KEY)
    expect(init.headers['x-goog-api-key']).toBe(KEY)
    const body = JSON.parse(init.body) as { contents: { parts: { text: string }[] }[]; generationConfig: { responseModalities: string[]; speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } } }
    // Anything sent besides the passage would be spoken with it.
    expect(body.contents).toEqual([{ parts: [{ text: 'Rund 3.030 Euro.' }] }])
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Sulafat')
  })

  it('wraps raw PCM in a WAV header at the rate the provider names', async () => {
    const audio = await new GeminiSpeech(CONFIG, answerWith({ data: pcm.toString('base64'), mimeType: 'audio/L16;rate=16000' })).speak({ text: 'a', language: 'de' })
    expect(isWav(audio.bytes)).toBe(true)
    expect(audio.bytes.readUInt32LE(24)).toBe(16_000)
    expect(audio.bytes.subarray(44).equals(pcm)).toBe(true)
  })

  it('hands a WAV file on unchanged', async () => {
    const wav = wavFromPcm(pcm, 24_000)
    const audio = await new GeminiSpeech(CONFIG, answerWith({ data: wav.toString('base64'), mimeType: 'audio/wav' })).speak({ text: 'a', language: 'en' })
    expect(audio.bytes.equals(wav)).toBe(true)
  })

  it('names a refusal by its status and an answer without audio, without the provider text', async () => {
    const refused: Fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota for "Rund 3.030 Euro."' } }) })
    await expect(new GeminiSpeech(CONFIG, refused).speak({ text: 'Rund 3.030 Euro.', language: 'de' })).rejects.toMatchObject({ reason: 'rejected', status: 429, message: 'speech provider: rejected (429)' })
    const empty: Fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [] }) })
    await expect(new GeminiSpeech(CONFIG, empty).speak({ text: 'a', language: 'de' })).rejects.toMatchObject({ reason: 'no-audio' })
  })

  it('names a dropped connection and its own deadline', async () => {
    const dropped: Fetch = async () => Promise.reject(new Error('socket hang up'))
    await expect(new GeminiSpeech(CONFIG, dropped).speak({ text: 'a', language: 'de' })).rejects.toMatchObject({ reason: 'unreachable' })
    const never: Fetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    await expect(new GeminiSpeech({ ...CONFIG, timeoutMs: 20 }, never).speak({ text: 'a', language: 'de' })).rejects.toMatchObject({ reason: 'timeout' })
  })
})

describe('the Mistral voice', () => {
  const answer = (audio: Buffer): Fetch => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ audio_data: audio.toString('base64') }) }))

  it('sends the passage alone with the voice of its language and the key as a bearer token', async () => {
    const fetchFn = answer(wavFromPcm(pcm, 24_000))
    await new MistralSpeech(MISTRAL, fetchFn).speak({ text: 'Rund 3.030 Euro.', language: 'de' })
    await new MistralSpeech(MISTRAL, fetchFn).speak({ text: 'About 3,030 euros.', language: 'en' })
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!
    expect(url).toBe('https://api.mistral.ai/v1/audio/speech')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(JSON.parse(init.body)).toEqual({ model: 'voxtral-mini-tts-3-0', input: 'Rund 3.030 Euro.', voice_id: 'voice_481', response_format: 'wav' })
    expect(JSON.parse(vi.mocked(fetchFn).mock.calls[1]![1].body)).toMatchObject({ input: 'About 3,030 euros.', voice_id: 'voice_447' })
  })

  it('hands a WAV file on unchanged and wraps bare PCM at 24 kHz', async () => {
    const wav = wavFromPcm(pcm, 24_000)
    expect((await new MistralSpeech(MISTRAL, answer(wav)).speak({ text: 'a', language: 'de' })).bytes.equals(wav)).toBe(true)
    const wrapped = await new MistralSpeech(MISTRAL, answer(pcm)).speak({ text: 'a', language: 'de' })
    expect(isWav(wrapped.bytes)).toBe(true)
    expect(wrapped.bytes.readUInt32LE(24)).toBe(24_000)
  })

  it('names a refusal by its status, an answer without audio, a dropped connection and its own deadline', async () => {
    const refused: Fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) })
    await expect(new MistralSpeech(MISTRAL, refused).speak({ text: 'a', language: 'de' })).rejects.toMatchObject({ reason: 'rejected', status: 401 })
    const empty: Fetch = async () => ({ ok: true, status: 200, json: async () => ({}) })
    await expect(new MistralSpeech(MISTRAL, empty).speak({ text: 'a', language: 'de' })).rejects.toMatchObject({ reason: 'no-audio' })
    const dropped: Fetch = async () => Promise.reject(new Error('socket hang up'))
    await expect(new MistralSpeech(MISTRAL, dropped).speak({ text: 'a', language: 'de' })).rejects.toMatchObject({ reason: 'unreachable' })
    const never: Fetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    await expect(new MistralSpeech({ ...MISTRAL, timeoutMs: 20 }, never).speak({ text: 'a', language: 'de' })).rejects.toMatchObject({ reason: 'timeout' })
  })
})

describe('reading the sample rate', () => {
  it('takes it from the MIME type and falls back to 24 kHz', () => {
    expect(sampleRateOf('audio/L16;codec=pcm;rate=22050')).toBe(22_050)
    expect(sampleRateOf(undefined)).toBe(24_000)
  })
})

describe('the speech service', () => {
  const request = { text: 'Hallo.', language: 'de' as const }

  it('speaks with the configured voice', async () => {
    const audio = await new SpeechService(new FakeSpeech()).speak(request)
    expect(isWav(audio.bytes)).toBe(true)
    expect(audio.mimeType).toBe('audio/wav')
  })

  it('says the voice is not set up where there is none, and asks no provider', async () => {
    const service = new SpeechService(new NoSpeech())
    expect(service.available).toBe(false)
    await expect(service.speak(request)).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' })
    await expect(service.speak(request)).rejects.toBeInstanceOf(UnavailableError)
  })

  it('answers "not reachable" when the provider fails, without the provider reason', async () => {
    const failing = { available: true, speak: () => Promise.reject(new SpeechProviderError('rejected', 500)) }
    const error = await new SpeechService(failing).speak(request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnavailableError)
    expect(error).toMatchObject({ code: 'SPEECH_FAILED', message: 'Die Stimme der Eule ist gerade nicht erreichbar.' })
  })

  it('stops at the day\'s call limit before it asks the provider', async () => {
    const port = { available: true, speak: vi.fn(() => new FakeSpeech().speak(request)) }
    let taken = 0
    const shared = { rateLimitStorage: { consume: vi.fn(async (_key: string, { max }: { max: number }) => ({ allowed: ++taken <= max })) } }
    const service = new SpeechService(port, shared as never, { AI_SPEECH_DAILY_CALL_LIMIT: '2' })
    await service.speak(request)
    await service.speak(request)
    await expect(service.speak(request)).rejects.toBeInstanceOf(TooManyRequestsError)
    expect(port.speak).toHaveBeenCalledTimes(2)
    expect(shared.rateLimitStorage.consume.mock.calls[0]![0]).toMatch(/^speech-calls:\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps speaking when the counter itself fails', async () => {
    const shared = { rateLimitStorage: { consume: async () => Promise.reject(new Error('redis down')) } }
    await expect(new SpeechService(new FakeSpeech(), shared as never).speak(request)).resolves.toMatchObject({ mimeType: 'audio/wav' })
  })
})
