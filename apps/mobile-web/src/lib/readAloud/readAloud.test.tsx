import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { readAloud, resetReadAloud, stopReadingAloud, useCanReadAloud, useSpeakingId, voiceFor, type SpeechDevice } from './readAloud'

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
    act(() => readAloud('a1', ['Eins.', 'Zwei.'], 'de', device))
    expect(spoken.map((u) => [u.text, u.lang, u.voice?.lang])).toEqual([['Eins.', 'de-DE', 'de-DE'], ['Zwei.', 'de-DE', 'de-DE']])
    expect(speaking.result.current).toBe('a1')
    act(() => spoken[1]?.fire('end'))
    expect(speaking.result.current).toBeNull()
  })

  it('reads one answer at a time: the next one stops the first, and its late end changes nothing', () => {
    const { device, spoken, cancelled } = fakeDevice([{ lang: 'de-DE' }])
    const speaking = renderHook(() => useSpeakingId())
    act(() => readAloud('a1', ['Eins.'], 'de', device))
    act(() => readAloud('a2', ['Zwei.'], 'de', device))
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
    act(() => readAloud('a1', ['Eins.', 'Zwei.'], 'de', device))
    act(() => spoken[0]?.fire('error'))
    expect(speaking.result.current).toBeNull()
  })

  it('offers nothing without a voice for the language, and notices voices that load later', () => {
    const fake = fakeDevice([{ lang: 'en-US' }])
    expect(voiceFor(fake.device, 'de')).toBeUndefined()
    expect(voiceFor(null, 'de')).toBeUndefined()
    const can = renderHook(() => useCanReadAloud('de', fake.device))
    expect(can.result.current).toBe(false)
    act(() => readAloud('a1', ['Eins.'], 'de', fake.device))
    expect(fake.spoken).toEqual([])
    act(() => {
      fake.voices.push({ lang: 'de-AT' })
      fake.voicesChanged()
    })
    expect(can.result.current).toBe(true)
  })
})
