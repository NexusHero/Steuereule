import { useSyncExternalStore } from 'react'
import type { ServerVoice } from './serverVoice'

/**
 * Reading an answer aloud, one answer at a time. With the owl's voice (ADR-0115) the server speaks each
 * passage; without it the device's own voice reads (Web Speech API) and nothing is sent anywhere. Where
 * there is neither, there is nothing to offer.
 */
interface Voice {
  readonly lang: string
}
interface Utterance {
  lang: string
  voice: Voice | null
  addEventListener(type: 'end' | 'error', listener: () => void): void
}
export interface SpeechDevice {
  readonly synth: {
    speak(utterance: Utterance): void
    cancel(): void
    getVoices(): readonly Voice[]
    addEventListener?(type: 'voiceschanged', listener: () => void): void
    removeEventListener?(type: 'voiceschanged', listener: () => void): void
  }
  readonly utterance: (text: string) => Utterance
}

/** The browser's speech synthesis, or null where there is none (native builds, old browsers). */
export function browserSpeechDevice(): SpeechDevice | null {
  const scope = globalThis as unknown as { speechSynthesis?: SpeechDevice['synth']; SpeechSynthesisUtterance?: new (text: string) => Utterance }
  const { speechSynthesis: synth, SpeechSynthesisUtterance: Ctor } = scope
  if (!synth || !Ctor) return null
  return { synth, utterance: (text) => new Ctor(text) }
}

const sameLanguage = (voice: Voice, language: string): boolean => voice.lang.toLowerCase().slice(0, 2) === language.toLowerCase().slice(0, 2)

/** The device's voice for `language`, or undefined: a voice of another language would mispronounce every word. */
export function voiceFor(device: SpeechDevice | null, language: string): Voice | undefined {
  return device?.synth.getVoices().find((voice) => sameLanguage(voice, language))
}

let speakingId: string | null = null
let run = 0
const listeners = new Set<() => void>()

function setSpeaking(next: string | null): void {
  if (speakingId === next) return
  speakingId = next
  for (const listener of listeners) listener()
}

/** Ends whatever the server voice is fetching or playing. */
let stopServerVoice: (() => void) | null = null

function readOnDevice(id: string, chunks: readonly string[], language: string, device: SpeechDevice | null, mine: number): void {
  const voice = voiceFor(device, language)
  if (!device || !voice || chunks.length === 0) {
    if (run === mine) setSpeaking(null)
    return
  }
  setSpeaking(id)
  const done = (): void => {
    // A cancelled utterance ends too; only the run that is still current may clear the state.
    if (run === mine) setSpeaking(null)
  }
  chunks.forEach((chunk, index) => {
    const utterance = device.utterance(chunk)
    utterance.lang = voice.lang
    utterance.voice = voice
    utterance.addEventListener('error', done)
    if (index === chunks.length - 1) utterance.addEventListener('end', done)
    device.synth.speak(utterance)
  })
}

async function readWithServer(id: string, chunks: readonly string[], language: string, voice: ServerVoice, device: SpeechDevice | null, mine: number): Promise<void> {
  const output = voice.output()
  if (!output) return readOnDevice(id, chunks, language, device, mine)
  const abort = new AbortController()
  stopServerVoice = () => {
    abort.abort()
    output.stop()
  }
  setSpeaking(id)
  const fetchPassage = (index: number): Promise<Blob> | null => {
    const chunk = chunks[index]
    if (chunk === undefined) return null
    const passage = voice.passage(chunk, language, abort.signal)
    // Fetched ahead of its turn: a failure is dealt with when the turn comes.
    passage.catch(() => undefined)
    return passage
  }
  let next = fetchPassage(0)
  for (let index = 0; next !== null; index += 1) {
    try {
      const audio = await next
      if (run !== mine) return
      next = fetchPassage(index + 1)
      await output.play(audio)
      if (run !== mine) return
    } catch {
      if (run !== mine) return
      // The voice failed mid-answer: the device reads the rest, so the answer is not cut off.
      stopServerVoice = null
      return readOnDevice(id, chunks.slice(index), language, device, mine)
    }
  }
  stopServerVoice = null
  setSpeaking(null)
}

export interface ReadAloudWith {
  readonly device?: SpeechDevice | null
  /** The owl's voice from the server; null or absent reads on the device. */
  readonly voice?: ServerVoice | null
}

/** Reads `chunks` as the answer `id`; whatever was being read stops. */
export function readAloud(id: string, chunks: readonly string[], language: string, { device = browserSpeechDevice(), voice = null }: ReadAloudWith = {}): void {
  if (chunks.length === 0 || (!voice && !voiceFor(device, language))) return
  const mine = ++run
  stopServerVoice?.()
  stopServerVoice = null
  device?.synth.cancel()
  if (voice) void readWithServer(id, chunks, language, voice, device, mine)
  else readOnDevice(id, chunks, language, device, mine)
}

export function stopReadingAloud(device: SpeechDevice | null = browserSpeechDevice()): void {
  run += 1
  stopServerVoice?.()
  stopServerVoice = null
  device?.synth.cancel()
  setSpeaking(null)
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The id of the answer being read, or null. */
export function useSpeakingId(): string | null {
  return useSyncExternalStore(subscribe, () => speakingId, () => null)
}

/** Whether this device can read `language` aloud. Voices load after the page, so this can turn true later. */
export function useCanReadAloud(language: string, device: SpeechDevice | null = browserSpeechDevice()): boolean {
  return useSyncExternalStore(
    (listener) => {
      device?.synth.addEventListener?.('voiceschanged', listener)
      return () => device?.synth.removeEventListener?.('voiceschanged', listener)
    },
    () => voiceFor(device, language) !== undefined,
    () => false,
  )
}

/** For tests: nothing is being read. */
export function resetReadAloud(): void {
  run += 1
  stopServerVoice?.()
  stopServerVoice = null
  setSpeaking(null)
}
