import { useSyncExternalStore } from 'react'

/**
 * Reading an answer aloud with the device's own voice (Web Speech API): nothing is sent anywhere, and
 * where the device has no voice for the language there is nothing to offer. One answer at a time.
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

/** Reads `chunks` as the answer `id`; whatever was being read stops. */
export function readAloud(id: string, chunks: readonly string[], language: string, device: SpeechDevice | null = browserSpeechDevice()): void {
  const voice = voiceFor(device, language)
  if (!device || !voice || chunks.length === 0) return
  const mine = ++run
  device.synth.cancel()
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

export function stopReadingAloud(device: SpeechDevice | null = browserSpeechDevice()): void {
  run += 1
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
  setSpeaking(null)
}
