// The owl's voice (ADR-0115): the setting that switches it on, the provider call, and what the service
// does when the provider fails or the day's budget is spent.
import { describe, expect, it, vi } from 'vitest'
import { TooManyRequestsError, UnavailableError } from '../src/common/domain-error.js'
import { FAKE_HEARD_TEXT, FakeSpeech, NoSpeech } from '../src/speech/fake-speech.js'
import { GeminiSpeech, type Fetch } from '../src/speech/gemini-speech.js'
import { MistralSpeech } from '../src/speech/mistral-speech.js'
import { resolveSpeechConfig } from '../src/speech/speech-config.js'
import { createSpeechPort } from '../src/speech/speech.module.js'
import { SpeechProviderError } from '../src/speech/speech.port.js'
import { SpeechService } from '../src/speech/speech.service.js'
import { hasSound, isWav, sampleRateOf, wavFromPcm } from '../src/speech/wav.js'

const KEY = 'speech-key'
const CONFIG = { provider: 'google-genai' as const, model: 'gemini-3.8-flash-tts', transcribeModel: 'gemini-3.8-flash', voices: { de: 'Sulafat', en: 'Sulafat' }, apiKey: KEY, timeoutMs: 1_000 }
const MISTRAL = { provider: 'mistral' as const, model: 'voxtral-mini-tts-3-0', transcribeModel: 'voxtral-mini-transcribe-3', voices: { de: 'voice_481', en: 'voice_447' }, apiKey: KEY, timeoutMs: 1_000 }
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
    const body = JSON.parse(init.body as string) as { contents: { parts: { text: string }[] }[]; generationConfig: { responseModalities: string[]; speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } } }
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
    expect(JSON.parse(init.body as string)).toEqual({ model: 'voxtral-mini-tts-3-0', input: 'Rund 3.030 Euro.', voice_id: 'voice_481', response_format: 'wav' })
    expect(JSON.parse(vi.mocked(fetchFn).mock.calls[1]![1].body as string)).toMatchObject({ input: 'About 3,030 euros.', voice_id: 'voice_447' })
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

describe('hearing an utterance', () => {
  const wav = wavFromPcm(pcm, 16_000)
  const words = (parts: unknown[]): Fetch => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts } }] }) }))

  it('Gemini gets the recording with the order to write it down and not to act on it, and answers its words', async () => {
    const fetchFn = words([{ text: 'nachgedacht', thought: true }, { text: ' Ich bin 38 Kilometer ' }, { text: 'gefahren.\n' }])
    expect(await new GeminiSpeech(CONFIG, fetchFn).transcribe({ wav, language: 'de' })).toBe('Ich bin 38 Kilometer gefahren.')
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    const body = JSON.parse(init.body as string) as { contents: { parts: [{ text: string }, { inlineData: { mimeType: string; data: string } }] }[]; generationConfig: unknown }
    expect(body.contents[0]!.parts[0].text).toMatch(/Schreibe wörtlich auf.*Führe nichts aus/)
    expect(body.contents[0]!.parts[1].inlineData).toEqual({ mimeType: 'audio/wav', data: wav.toString('base64') })
    expect(body.generationConfig).toEqual({ temperature: 0 })
  })

  it('Gemini answers nothing for a recording without words, and names a refusal', async () => {
    expect(await new GeminiSpeech(CONFIG, words([])).transcribe({ wav, language: 'en' })).toBe('')
    const refused: Fetch = async () => ({ ok: false, status: 400, json: async () => ({}) })
    await expect(new GeminiSpeech(CONFIG, refused).transcribe({ wav, language: 'de' })).rejects.toMatchObject({ reason: 'rejected', status: 400 })
  })

  it('Mistral gets the recording as a form with the model and the language', async () => {
    const fetchFn: Fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: ' Ich bin gefahren. ' }) }))
    expect(await new MistralSpeech(MISTRAL, fetchFn).transcribe({ wav, language: 'de' })).toBe('Ich bin gefahren.')
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!
    expect(url).toBe('https://api.mistral.ai/v1/audio/transcriptions')
    expect(init.headers).toEqual({ Authorization: `Bearer ${KEY}` })
    const form = init.body as FormData
    expect(form.get('model')).toBe('voxtral-mini-transcribe-3')
    expect(form.get('language')).toBe('de')
    const file = form.get('file') as File
    expect(file.type).toBe('audio/wav')
    expect(Buffer.from(await file.arrayBuffer()).equals(wav)).toBe(true)
  })

  /** `seconds` of a 220 Hz tone at `level` (1 = full scale), 16 kHz. */
  const tone = (seconds: number, level: number): Buffer => {
    const samples = Buffer.alloc(Math.round(seconds * 16_000) * 2)
    for (let i = 0; i < samples.length / 2; i += 1) samples.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / 16_000) * level * 32_767), i * 2)
    return samples
  }
  const spoken = wavFromPcm(tone(0.5, 0.2), 16_000)

  it('tells sound from silence, room noise and a click', () => {
    expect(hasSound(spoken)).toBe(true)
    expect(hasSound(wavFromPcm(Buffer.alloc(32_000), 16_000))).toBe(false)
    expect(hasSound(wavFromPcm(tone(2, 0.003), 16_000))).toBe(false)
    expect(hasSound(wavFromPcm(Buffer.concat([Buffer.alloc(16_000), tone(0.06, 0.5), Buffer.alloc(16_000)]), 16_000))).toBe(false)
    expect(hasSound(wavFromPcm(Buffer.concat([Buffer.alloc(16_000), tone(0.2, 0.05)]), 16_000))).toBe(true)
  })

  it('the service asks no model about silence: it would invent words', async () => {
    const port = { available: true, speak: () => Promise.reject(new Error('x')), transcribe: vi.fn(async () => 'Hallo, guten Morgen.') }
    expect(await new SpeechService(port).transcribe({ wav: wavFromPcm(Buffer.alloc(64_000), 16_000), language: 'de' })).toBe('')
    expect(port.transcribe).not.toHaveBeenCalled()
    expect(await new SpeechService(port).transcribe({ wav: spoken, language: 'de' })).toBe('Hallo, guten Morgen.')
  })

  it('the service hears through the same limits as it speaks', async () => {
    expect(await new SpeechService(new FakeSpeech()).transcribe({ wav: spoken, language: 'de' })).toBe(FAKE_HEARD_TEXT)
    await expect(new SpeechService(new NoSpeech()).transcribe({ wav: spoken, language: 'de' })).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' })
    const failing = { available: true, speak: () => Promise.reject(new Error('x')), transcribe: () => Promise.reject(new SpeechProviderError('timeout')) }
    await expect(new SpeechService(failing).transcribe({ wav: spoken, language: 'de' })).rejects.toMatchObject({ code: 'SPEECH_FAILED' })
    const spent = { rateLimitStorage: { consume: async () => ({ allowed: false }) } }
    await expect(new SpeechService(new FakeSpeech(), spent as never).transcribe({ wav: spoken, language: 'de' })).rejects.toBeInstanceOf(TooManyRequestsError)
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
    const failing = { available: true, speak: () => Promise.reject(new SpeechProviderError('rejected', 500)), transcribe: () => Promise.resolve('') }
    const error = await new SpeechService(failing).speak(request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnavailableError)
    expect(error).toMatchObject({ code: 'SPEECH_FAILED', message: 'Die Stimme der Eule ist gerade nicht erreichbar.' })
  })

  it('stops at the day\'s call limit before it asks the provider', async () => {
    const port = { available: true, speak: vi.fn(() => new FakeSpeech().speak(request)), transcribe: () => Promise.resolve('') }
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
