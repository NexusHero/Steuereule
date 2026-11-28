import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { readAloud, resetReadAloud, stopReadingAloud, useCanReadAloud, useSpeakingId, voiceFor, type SpeechDevice } from './readAloud'
import type { AudioOutput, ServerVoice } from './serverVoice'

interface Spoken {
  readonly text: string
  lang: string
  voice: { readonly lang: string } | null
  /** What the device would report: the piece was said to its end, or the voice failed. */
  readonly fire: (type: 'end' | 'error') => void
  addEventListener(type: 'end' | 'error', listener: () => void): void
}

function fakeDevice(voices: Array<{ lang: string }>) {
  const spoken: Spoken[] = []
  let cancelled = 0
  const listeners = new Set<() => void>()
  const device: SpeechDevice = {
    synth: {
      speak: (utterance) => void spoken.push(utterance as Spoken),
      cancel: () => void (cancelled += 1),
      getVoices: () => voices,
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    },
    utterance: (text) => {
      const heard: Array<[string, () => void]> = []
      const utterance: Spoken = { text, lang: '', voice: null, fire: (type) => heard.filter(([t]) => t === type).forEach(([, l]) => l()), addEventListener: (type, listener) => void heard.push([type, listener]) }
      return utterance
    },
  }
  return { device, spoken, voices, cancelled: () => cancelled, voicesChanged: () => listeners.forEach((l) => l()) }
}

afterEach(() => resetReadAloud())

describe('reading an answer aloud on the device', () => {
  it('reads every piece with the voice of the language and is done after the last one', () => {
    const { device, spoken } = fakeDevice([{ lang: 'en-US' }, { lang: 'de-DE' }])
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.', 'Zwei.'], 'de', { device: device }))
    expect(spoken.map((u) => [u.text, u.lang, u.voice?.lang])).toEqual([['Eins.', 'de-DE', 'de-DE'], ['Zwei.', 'de-DE', 'de-DE']])
    expect(speaking.result.current).toBe('a1')
    act(() => spoken[1]?.fire('end'))
    expect(speaking.result.current).toBeNull()
  })

  it('reads one answer at a time: the next one stops the first, and its late end changes nothing', () => {
    const { device, spoken, cancelled } = fakeDevice([{ lang: 'de-DE' }])
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.'], 'de', { device: device }))
    act(() => readAloud('a2', ['Zwei.'], 'de', { device: device }))
    expect(cancelled()).toBe(2)
    act(() => spoken[0]?.fire('end'))
    expect(speaking.result.current).toBe('a2')
    act(() => stopReadingAloud(device))
    expect(speaking.result.current).toBeNull()
    expect(cancelled()).toBe(3)
  })

  it('stops showing an answer as being read when the voice fails', () => {
    const { device, spoken } = fakeDevice([{ lang: 'de-DE' }])
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.', 'Zwei.'], 'de', { device: device }))
    act(() => spoken[0]?.fire('error'))
    expect(speaking.result.current).toBeNull()
  })

  it('offers nothing without a voice for the language, and notices voices that load later', () => {
    const fake = fakeDevice([{ lang: 'en-US' }])
    expect(voiceFor(fake.device, 'de')).toBeUndefined()
    expect(voiceFor(null, 'de')).toBeUndefined()
    const can = renderHook(() => useCanReadAloud('de', fake.device))
    expect(can.result.current).toBe(false)
    act(() => readAloud('a1', ['Eins.'], 'de', { device: fake.device }))
    expect(fake.spoken).toEqual([])
    act(() => {
      fake.voices.push({ lang: 'de-AT' })
      fake.voicesChanged()
    })
    expect(can.result.current).toBe(true)
  })
})

interface Played {
  readonly text: string
  readonly end: () => void
  readonly fail: () => void
}

/** A server voice whose passages arrive and whose audio ends when the test says so. */
function fakeVoice({ failing = [] as string[], withOutput = true } = {}) {
  const asked: string[] = []
  const played: Played[] = []
  const arrive = new Map<string, () => void>()
  // jsdom's Blob cannot be read back, so the fake remembers which passage each one is.
  const texts = new Map<Blob, string>()
  let stopped = 0
  let aborted = 0
  const output: AudioOutput = {
    play: (audio) => new Promise<void>((resolve, reject) => void played.push({ text: texts.get(audio) ?? '?', end: resolve, fail: () => reject(new Error('no audio')) })),
    stop: () => void (stopped += 1),
  }
  const remember = (text: string): Blob => {
    const audio = new Blob([text])
    texts.set(audio, text)
    return audio
  }
  const voice: ServerVoice = {
    passage: (text, _language, signal) => {
      asked.push(text)
      signal.addEventListener('abort', () => void (aborted += 1))
      return new Promise<Blob>((resolve, reject) => arrive.set(text, () => (failing.includes(text) ? reject(new Error('503')) : resolve(remember(text)))))
    },
    output: () => (withOutput ? output : null),
  }
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await act(async () => Promise.resolve())
  }
  return { voice, asked, played, stopped: () => stopped, aborted: () => aborted, arrives: async (text: string) => (arrive.get(text)?.(), settle()), settle }
}

describe('reading an answer aloud with the owl\'s voice', () => {
  it('plays the passages in order, fetches the next one while one plays, and is done after the last', async () => {
    const { voice, asked, played, arrives, settle } = fakeVoice()
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.', 'Zwei.'], 'de', { device: null, voice }))
    expect(speaking.result.current).toBe('a1')
    expect(asked).toEqual(['Eins.'])
    await arrives('Eins.')
    expect(played.map((p) => p.text)).toEqual(['Eins.'])
    expect(asked).toEqual(['Eins.', 'Zwei.'])
    await arrives('Zwei.')
    expect(played).toHaveLength(1)
    played[0]?.end()
    await settle()
    expect(played.map((p) => p.text)).toEqual(['Eins.', 'Zwei.'])
    expect(speaking.result.current).toBe('a1')
    played[1]?.end()
    await settle()
    expect(speaking.result.current).toBeNull()
  })

  it('needs no voice on the device', () => {
    const { voice, asked } = fakeVoice()
    act(() => readAloud('a1', ['Eins.'], 'de', { device: null, voice }))
    expect(asked).toEqual(['Eins.'])
  })

  it('stops: the fetch is given up, the audio ends, and a passage that arrives late is not played', async () => {
    const { voice, played, stopped, aborted, arrives } = fakeVoice()
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.', 'Zwei.'], 'de', { device: null, voice }))
    act(() => stopReadingAloud(null))
    expect(speaking.result.current).toBeNull()
    expect(stopped()).toBe(1)
    expect(aborted()).toBe(1)
    await arrives('Eins.')
    expect(played).toEqual([])
  })

  it('lets the device read the rest when the voice fails mid-answer', async () => {
    const { device, spoken } = fakeDevice([{ lang: 'de-DE' }])
    const { voice, played, arrives, settle } = fakeVoice({ failing: ['Zwei.'] })
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.', 'Zwei.', 'Drei.'], 'de', { device, voice }))
    await arrives('Eins.')
    await arrives('Zwei.')
    played[0]?.end()
    await settle()
    expect(spoken.map((u) => u.text)).toEqual(['Zwei.', 'Drei.'])
    expect(speaking.result.current).toBe('a1')
    act(() => spoken[1]?.fire('end'))
    expect(speaking.result.current).toBeNull()
  })

  it('is over when the voice fails and the device has no voice either', async () => {
    const { voice, arrives } = fakeVoice({ failing: ['Eins.'] })
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.'], 'de', { device: null, voice }))
    await arrives('Eins.')
    expect(speaking.result.current).toBeNull()
  })

  it('reads on the device where this browser cannot play audio', () => {
    const { device, spoken } = fakeDevice([{ lang: 'de-DE' }])
    const { voice, asked } = fakeVoice({ withOutput: false })
    act(() => readAloud('a1', ['Eins.'], 'de', { device, voice }))
    expect(asked).toEqual([])
    expect(spoken.map((u) => u.text)).toEqual(['Eins.'])
  })

  it('a second answer ends the first: its audio stops and its next passage is never played', async () => {
    const first = fakeVoice()
    const second = fakeVoice()
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.', 'Zwei.'], 'de', { device: null, voice: first.voice }))
    await first.arrives('Eins.')
    act(() => readAloud('a2', ['Drei.'], 'de', { device: null, voice: second.voice }))
    expect(first.stopped()).toBe(1)
    first.played[0]?.end()
    await first.arrives('Zwei.')
    expect(first.played).toHaveLength(1)
    expect(speaking.result.current).toBe('a2')
  })
})
