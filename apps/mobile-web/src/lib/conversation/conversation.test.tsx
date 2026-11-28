import { describe, expect, it, vi } from 'vitest'
import type { ServerVoice } from '../readAloud/serverVoice'
import { createConversation, MAX_UTTERANCE_MS, type AnswerUpdate } from './conversation'
import type { Speaker } from './speaker'

const LOUD = 0.1
const QUIET = 0.001

/** A conversation with a microphone, an ear, a chat and a voice the test drives by hand. */
function stage({ heard = 'Ich bin 38 Kilometer gefahren.' as string | Error, reaches = true as boolean | Error, microphone = true, canPlay = true } = {}) {
  let time = 0
  let level: ((value: number) => void) | null = null
  const session = { take: vi.fn(async (_lastMs: number) => new Blob(['wav'])), restart: vi.fn(), close: vi.fn() }
  const said: string[] = []
  const speakers: Array<{ stopped: boolean; finished: boolean; end: () => void; fail: () => void; onPassage: (passage: string) => void }> = []
  const timers: Array<{ run: () => void; at: number; off: boolean }> = []
  const sent: string[] = []
  let sendDone: ((reached: boolean | void) => void) | null = null
  const stopAnswer = vi.fn()
  const hear = vi.fn(async () => {
    if (heard instanceof Error) throw heard
    return heard
  })
  const voice: ServerVoice = { passage: () => Promise.reject(new Error('unused')), output: () => (canPlay ? { play: () => Promise.resolve(), stop: () => undefined } : null) }
  const conversation = createConversation({
    microphone: {
      open: async (onLevel) => {
        if (!microphone) throw new Error('NotAllowedError')
        level = onLevel
        return session
      },
    },
    hear,
    voice,
    send: (text) => {
      sent.push(text)
      if (reaches instanceof Error) return Promise.reject(reaches)
      return new Promise<boolean | void>((resolve) => (sendDone = resolve))
    },
    stopAnswer,
    language: 'de',
    now: () => time,
    later: (run, ms) => {
      const timer = { run, at: time + ms, off: false }
      timers.push(timer)
      return () => void (timer.off = true)
    },
    speaker: ({ onPassage }): Speaker => {
      const mine = { stopped: false, finished: false, end: () => undefined as void, fail: () => undefined as void, onPassage }
      speakers.push(mine)
      return {
        say: (passage) => void said.push(passage),
        finish: () => {
          mine.finished = true
          return new Promise<void>((resolve, reject) => {
            mine.end = resolve
            mine.fail = () => reject(new Error('voice'))
          })
        },
        stop: () => void (mine.stopped = true),
        level: () => 0.3,
      }
    },
  })
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  }
  /** `ms` of the microphone at `value`, one measurement every 50 ms. */
  const mic = async (value: number, ms: number): Promise<void> => {
    for (let passed = 0; passed < ms; passed += 50) {
      time += 50
      level?.(value)
    }
    await settle()
  }
  const answer = async (update: Partial<AnswerUpdate>): Promise<void> => {
    conversation.answer({ text: '', running: false, answerId: null, ...update })
    await settle()
  }
  /** One utterance, written down and sent. */
  const speak = async (): Promise<void> => {
    await mic(LOUD, 500)
    await mic(QUIET, 1_000)
  }
  const elapse = async (ms: number): Promise<void> => {
    time += ms
    for (const timer of timers) {
      if (timer.off || timer.at > time) continue
      timer.off = true
      timer.run()
    }
    await settle()
  }
  return { conversation, state: () => conversation.getSnapshot(), session, hear, sent, said, speakers, stopAnswer, mic, answer, speak, settle, elapse, sendArrives: async (reached: boolean | void = true) => (sendDone?.(reached), settle()) }
}

describe('a spoken conversation', () => {
  it('opens the microphone and listens', async () => {
    const { conversation, state } = stage()
    expect(state()).toMatchObject({ state: 'off', problem: null })
    const starting = conversation.start()
    expect(state().state).toBe('starting')
    await starting
    expect(state()).toMatchObject({ state: 'listening', level: 0, caption: '' })
  })

  it('says so when the microphone is refused, and when this browser cannot play audio', async () => {
    const refused = stage({ microphone: false })
    await refused.conversation.start()
    expect(refused.state()).toMatchObject({ state: 'off', problem: 'microphone' })
    const mute = stage({ canPlay: false })
    await mute.conversation.start()
    expect(mute.state()).toMatchObject({ state: 'off', problem: 'microphone' })
  })

  it('shows the loudness while it listens, and hears speech begin', async () => {
    const { conversation, state, mic } = stage()
    await conversation.start()
    await mic(QUIET, 200)
    expect(state()).toMatchObject({ state: 'listening', level: QUIET })
    await mic(LOUD, 200)
    expect(state()).toMatchObject({ state: 'hearing', level: LOUD })
  })

  it('writes down an utterance after the pause and sends it as a chat message', async () => {
    const { conversation, state, session, hear, sent, speak } = stage()
    await conversation.start()
    await speak()
    // From the first loud moment to the end of the pause, and a little before it.
    expect(session.take).toHaveBeenCalledWith(1_400 + 400)
    expect(hear).toHaveBeenCalledWith(expect.any(Blob), 'de')
    expect(sent).toEqual(['Ich bin 38 Kilometer gefahren.'])
    expect(state()).toMatchObject({ state: 'thinking', caption: 'Ich bin 38 Kilometer gefahren.', captionBy: 'user' })
  })

  it('goes on listening when nothing was said, and says so when it could not write it down', async () => {
    const nothing = stage({ heard: '  ' })
    await nothing.conversation.start()
    await nothing.speak()
    expect(nothing.sent).toEqual([])
    expect(nothing.state()).toMatchObject({ state: 'listening', problem: null })
    expect(nothing.session.restart).toHaveBeenCalled()

    const failed = stage({ heard: new Error('503') })
    await failed.conversation.start()
    await failed.speak()
    expect(failed.state()).toMatchObject({ state: 'listening', problem: 'understanding' })
    // The next thing heard clears the notice.
    await failed.mic(LOUD, 200)
    expect(failed.state()).toMatchObject({ state: 'hearing', problem: null })
  })

  it('„Fertig“ ends the utterance without waiting for the pause', async () => {
    const { conversation, state, mic, sent, settle } = stage()
    await conversation.start()
    await mic(LOUD, 300)
    conversation.endUtterance()
    await settle()
    expect(sent).toHaveLength(1)
    expect(state().state).toBe('thinking')
  })

  it('ends an utterance that never pauses before the server would refuse it', async () => {
    const { conversation, mic, sent } = stage()
    await conversation.start()
    await mic(LOUD, MAX_UTTERANCE_MS + 500)
    expect(sent).toHaveLength(1)
  })

  it('speaks the answer while it is written: every finished passage once, the rest when the answer is done', async () => {
    const { conversation, state, said, speakers, speak, answer } = stage()
    await conversation.start()
    await answer({ answerId: 'a0', text: 'Eine alte Antwort.' })
    await speak()
    expect(said).toEqual([])
    await answer({ running: true, answerId: 'a0', text: 'Das sind rund 3.030 Euro. Soll ich' })
    expect(said).toEqual(['Das sind rund 3.030 Euro.'])
    // What follows the first sentence is spoken in pieces a voice takes whole, so the half-written rest waits.
    await answer({ running: true, answerId: 'a0', text: 'Das sind rund 3.030 Euro. Soll ich das vormerken? Sag' })
    expect(said).toEqual(['Das sind rund 3.030 Euro.'])
    speakers[0]?.onPassage('Das sind rund 3.030 Euro.')
    expect(state()).toMatchObject({ state: 'speaking', caption: 'Das sind rund 3.030 Euro.', captionBy: 'owl', level: 0 })
    await answer({ running: true, answerId: 'a0', text: 'Das sind rund 3.030 Euro. Soll ich das vormerken? Sag Bescheid.' })
    expect(said).toEqual(['Das sind rund 3.030 Euro.'])
    await answer({ running: false, answerId: 'a1', text: 'Das sind rund 3.030 Euro. Soll ich das vormerken? Sag Bescheid.' })
    expect(said).toEqual(['Das sind rund 3.030 Euro.', 'Soll ich das vormerken? Sag Bescheid.'])
    expect(speakers[0]?.finished).toBe(true)
    expect(state().state).toBe('speaking')
  })

  it('speaks what the owl wrote, not the notes the app adds to the stored answer', async () => {
    const { conversation, said, speak, answer } = stage()
    await conversation.start()
    await speak()
    await answer({ running: true, text: 'Ja, das ist absetzbar. Der' })
    await answer({ running: true, text: 'Ja, das ist absetzbar. Der Betrag mindert deine Steuer.' })
    await answer({ running: false, answerId: 'a1', text: 'Ja, das ist absetzbar. Der Betrag mindert deine Steuer.\n\nUnverändert gelassen, weil schon eingetragen: Kinder.' })
    expect(said).toEqual(['Ja, das ist absetzbar.', 'Der Betrag mindert deine Steuer.'])
  })

  it('the line follows the voice while the owl speaks', async () => {
    const { conversation, state, speakers, speak, answer, mic } = stage()
    await conversation.start()
    await speak()
    await answer({ running: true, text: 'Das ist der erste Satz. Zwei' })
    speakers[0]?.onPassage('Das ist der erste Satz.')
    await mic(LOUD, 50)
    expect(state()).toMatchObject({ state: 'speaking', level: 0.3 })
  })

  it('listens again once the answer was spoken to its end, with a fresh recording', async () => {
    const { conversation, state, session, speakers, speak, answer, settle, mic } = stage()
    await conversation.start()
    await speak()
    await answer({ running: true, text: 'Das ist der erste Satz. Zwei' })
    await answer({ running: false, answerId: 'a1', text: 'Das ist der erste Satz. Zwei.' })
    const restarts = session.restart.mock.calls.length
    speakers[0]?.end()
    await settle()
    expect(state()).toMatchObject({ state: 'listening', level: 0, problem: null })
    expect(session.restart.mock.calls.length).toBe(restarts + 1)
    // What the owl said into the room while it spoke starts no utterance.
    await mic(LOUD, 100)
    expect(state().state).toBe('listening')
  })

  it('does not take "not writing yet" for the end: the old answer is not spoken again', async () => {
    const { conversation, state, said, speak, answer } = stage()
    await conversation.start()
    await answer({ answerId: 'a0', text: 'Eine alte Antwort.' })
    await speak()
    await answer({ running: false, answerId: 'a0', text: 'Eine alte Antwort.' })
    expect(said).toEqual([])
    expect(state().state).toBe('thinking')
  })

  it('speaks an answer that came without streaming, once the message was sent', async () => {
    const { conversation, said, speak, answer, sendArrives } = stage()
    await conversation.start()
    await answer({ answerId: 'a0', text: 'Alt.' })
    await speak()
    await sendArrives(true)
    await answer({ running: false, answerId: 'a1', text: 'Neu und ganz.' })
    expect(said).toEqual(['Neu und ganz.'])
  })

  it('waits a moment for the stored answer after the writing ended, and reports a failed turn when none comes', async () => {
    const late = stage()
    await late.conversation.start()
    await late.answer({ answerId: 'a0', text: 'Alt.' })
    await late.speak()
    await late.answer({ running: true, answerId: 'a0', text: 'Neu' })
    await late.answer({ running: false, answerId: 'a0', text: 'Alt.' })
    expect(late.state().state).toBe('thinking')
    await late.answer({ running: false, answerId: 'a1', text: 'Neu.' })
    await late.elapse(5_000)
    expect(late.said).toEqual(['Neu.'])
    expect(late.state().problem).toBeNull()

    const failed = stage()
    await failed.conversation.start()
    await failed.answer({ answerId: 'a0', text: 'Alt.' })
    await failed.speak()
    await failed.answer({ running: true, answerId: 'a0', text: '' })
    await failed.answer({ running: false, answerId: 'a0', text: 'Alt.' })
    await failed.elapse(1_000)
    expect(failed.state().state).toBe('thinking')
    await failed.elapse(600)
    expect(failed.state()).toMatchObject({ state: 'listening', problem: 'answer' })
    expect(failed.said).toEqual([])
    expect(failed.speakers[0]?.stopped).toBe(true)
  })

  it('reports a message that did not reach the owl', async () => {
    const refused = stage()
    await refused.conversation.start()
    await refused.speak()
    await refused.sendArrives(false)
    expect(refused.state()).toMatchObject({ state: 'listening', problem: 'answer' })
    const thrown = stage({ reaches: new Error('offline') })
    await thrown.conversation.start()
    await thrown.speak()
    expect(thrown.state()).toMatchObject({ state: 'listening', problem: 'answer' })
  })

  it('says the voice failed and listens on: the answer is in the chat', async () => {
    const { conversation, state, speakers, speak, answer, settle } = stage()
    await conversation.start()
    await speak()
    await answer({ running: true, text: 'Das ist der erste Satz. Zwei' })
    await answer({ running: false, answerId: 'a1', text: 'Das ist der erste Satz. Zwei.' })
    speakers[0]?.fail()
    await settle()
    expect(state()).toMatchObject({ state: 'listening', problem: 'voice' })
  })

  it('„Unterbrechen“ stops the voice and the answer that is still written, and listens', async () => {
    const { conversation, state, said, speakers, stopAnswer, speak, answer } = stage()
    await conversation.start()
    await speak()
    await answer({ running: true, text: 'Das ist der erste Satz. Zwei' })
    conversation.interrupt()
    expect(speakers[0]?.stopped).toBe(true)
    expect(stopAnswer).toHaveBeenCalledOnce()
    expect(state().state).toBe('listening')
    // What still arrives of the interrupted answer is not spoken.
    await answer({ running: false, answerId: 'a1', text: 'Das ist der erste Satz. Zwei. Drei.' })
    expect(said).toEqual(['Das ist der erste Satz.'])
    expect(state().state).toBe('listening')
  })

  it('„Unterbrechen“ leaves a finished answer alone and does nothing while listening', async () => {
    const { conversation, state, stopAnswer, speak, answer } = stage()
    await conversation.start()
    conversation.interrupt()
    expect(state().state).toBe('listening')
    await speak()
    await answer({ running: true, text: 'Das ist der erste Satz. Zwei' })
    await answer({ running: false, answerId: 'a1', text: 'Das ist der erste Satz. Zwei.' })
    conversation.interrupt()
    expect(stopAnswer).not.toHaveBeenCalled()
    expect(state().state).toBe('listening')
  })

  it('ending releases the microphone and the voice, and a late transcript sends nothing', async () => {
    const { conversation, state, session, sent, mic } = stage()
    await conversation.start()
    await mic(LOUD, 300)
    conversation.endUtterance()
    conversation.stop()
    await mic(QUIET, 100)
    expect(session.close).toHaveBeenCalledOnce()
    expect(state()).toMatchObject({ state: 'off', caption: '', problem: null })
    expect(sent).toEqual([])
  })

  it('starts the recording over while nobody speaks, so it never grows', async () => {
    const { conversation, session, mic } = stage()
    await conversation.start()
    const before = session.restart.mock.calls.length
    await mic(QUIET, 45_000)
    expect(session.restart.mock.calls.length).toBe(before + 2)
  })

  it('tells its listeners, and stops telling one that left', async () => {
    const { conversation } = stage()
    const listener = vi.fn()
    const leave = conversation.subscribe(listener)
    await conversation.start()
    expect(listener).toHaveBeenCalled()
    leave()
    listener.mockClear()
    conversation.stop()
    expect(listener).not.toHaveBeenCalled()
  })
})
