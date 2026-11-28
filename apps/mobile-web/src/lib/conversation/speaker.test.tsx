import { describe, expect, it } from 'vitest'
import type { AudioOutput, ServerVoice } from '../readAloud/serverVoice'
import { createSpeaker } from './speaker'

/** A voice whose passages arrive, and an output whose pieces end, when the test says so. */
function stage({ failing = [] as string[] } = {}) {
  const asked: string[] = []
  const texts = new Map<Blob, string>()
  const arrive = new Map<string, () => void>()
  const playing: Array<{ readonly text: string; readonly end: () => void }> = []
  const started: string[] = []
  let stopped = 0
  let aborted = false
  let time = 0
  const voice: ServerVoice = {
    passage: (text, _language, signal) => {
      asked.push(text)
      signal.addEventListener('abort', () => (aborted = true))
      return new Promise<Blob>((resolve, reject) =>
        arrive.set(text, () => {
          if (failing.includes(text)) return reject(new Error('503'))
          const audio = new Blob([text])
          texts.set(audio, text)
          resolve(audio)
        }),
      )
    },
    output: () => output,
  }
  const output: AudioOutput = {
    play: (audio) => new Promise<void>((resolve) => void playing.push({ text: texts.get(audio) ?? '?', end: resolve })),
    stop: () => void (stopped += 1),
  }
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve()
  }
  const speaker = createSpeaker({ voice, output, language: 'de', onPassage: (passage) => void started.push(passage), now: () => time, envelopeOf: async () => [0.1, 0.4, 0.2] })
  return { speaker, asked, playing, started, settle, arrives: async (text: string) => (arrive.get(text)?.(), settle()), stopped: () => stopped, aborted: () => aborted, at: (ms: number) => void (time = ms) }
}

describe('speaking an answer while it is written', () => {
  it('asks for the first passage at once and plays the passages in order as they come', async () => {
    const { speaker, asked, playing, started, arrives, settle } = stage()
    speaker.say('Eins.')
    expect(asked).toEqual(['Eins.'])
    await arrives('Eins.')
    expect(started).toEqual(['Eins.'])
    expect(playing.map((piece) => piece.text)).toEqual(['Eins.'])
    // The second passage comes while the first plays: fetched now, played after.
    speaker.say('Zwei.')
    await settle()
    expect(asked).toEqual(['Eins.', 'Zwei.'])
    await arrives('Zwei.')
    expect(playing).toHaveLength(1)
    playing[0]?.end()
    await settle()
    expect(started).toEqual(['Eins.', 'Zwei.'])
  })

  it('waits for a passage that has not been written yet, and is done after the last one', async () => {
    const { speaker, playing, started, arrives, settle } = stage()
    speaker.say('Eins.')
    await arrives('Eins.')
    playing[0]?.end()
    await settle()
    let done = false
    speaker.say('Zwei.')
    void speaker.finish().then(() => (done = true))
    await arrives('Zwei.')
    expect(started).toEqual(['Eins.', 'Zwei.'])
    expect(done).toBe(false)
    playing[1]?.end()
    await settle()
    expect(done).toBe(true)
  })

  it('is done at once when there was nothing to say', async () => {
    await expect(stage().speaker.finish()).resolves.toBeUndefined()
  })

  it('reports the loudness of the piece that plays, step by step, and none in between', async () => {
    const { speaker, playing, arrives, at, settle } = stage()
    expect(speaker.level()).toBe(0)
    speaker.say('Eins.')
    await arrives('Eins.')
    expect(speaker.level()).toBe(0.1)
    at(60)
    expect(speaker.level()).toBe(0.4)
    at(500)
    expect(speaker.level()).toBe(0)
    playing[0]?.end()
    await settle()
    expect(speaker.level()).toBe(0)
  })

  it('stop ends the audio, gives up the fetches and plays nothing that arrives late', async () => {
    const { speaker, playing, started, arrives, stopped, aborted } = stage()
    speaker.say('Eins.')
    speaker.say('Zwei.')
    await arrives('Eins.')
    speaker.stop()
    expect(stopped()).toBe(1)
    expect(aborted()).toBe(true)
    playing[0]?.end()
    await arrives('Zwei.')
    expect(started).toEqual(['Eins.'])
    await expect(speaker.finish()).resolves.toBeUndefined()
    speaker.say('Drei.')
    expect(playing).toHaveLength(1)
  })

  it('finish rejects when the voice fails, also when it failed before anyone waited', async () => {
    const first = stage({ failing: ['Eins.'] })
    first.speaker.say('Eins.')
    const waiting = first.speaker.finish()
    await first.arrives('Eins.')
    await expect(waiting).rejects.toThrow('503')

    const second = stage({ failing: ['Eins.'] })
    second.speaker.say('Eins.')
    await second.arrives('Eins.')
    await expect(second.speaker.finish()).rejects.toThrow('503')
    expect(second.speaker.level()).toBe(0)
  })
})
