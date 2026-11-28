import type { ServerVoice } from '../readAloud/serverVoice'
import type { Microphone, MicrophoneSession } from './microphone'
import { createSpeaker, type Speaker, type SpeakerOptions } from './speaker'
import { passagesAfter, speakablePassages } from './spokenAnswer'
import { createVoiceActivity, DEFAULT_VOICE_ACTIVITY, type VoiceActivityOptions } from './voiceActivity'

/**
 * A spoken conversation with the owl (ADR-0115): listen, write down what was said, send it as an ordinary
 * chat message, and speak the answer while it is written. Free of React and of the browser, so the whole
 * course of a conversation runs in a test.
 *
 * off → starting → listening ⇄ hearing → understanding → thinking → speaking → listening …
 */
export type ConversationState = 'off' | 'starting' | 'listening' | 'hearing' | 'understanding' | 'thinking' | 'speaking'

/** What went wrong last; the conversation goes on listening unless the microphone itself is the problem. */
export type ConversationProblem = 'microphone' | 'understanding' | 'answer' | 'voice'

export interface ConversationSnapshot {
  readonly state: ConversationState
  /** Loudness for the line (RMS, 0 to 1): the microphone while listening, the voice while speaking. */
  readonly level: number
  /** What the user said last, or the passage the owl is saying. */
  readonly caption: string
  readonly captionBy: 'user' | 'owl' | null
  readonly problem: ConversationProblem | null
}

/** What the chat knows about the answer to the message this conversation sent. */
export interface AnswerUpdate {
  /** The answer so far while it is written, the stored answer once it is done. */
  readonly text: string
  /** The chat is still writing. */
  readonly running: boolean
  /** The id of the latest stored answer; a new id is how a finished turn is told from the one before. */
  readonly answerId: string | null
}

export interface ConversationDeps {
  readonly microphone: Microphone
  /** The words of an utterance; empty when nothing was said. */
  readonly hear: (wav: Blob, language: string) => Promise<string>
  readonly voice: ServerVoice
  /** Sends the words as a chat message; false when it did not reach the owl. */
  readonly send: (text: string) => Promise<boolean | void> | boolean | void
  /** Stops the answer that is being written. */
  readonly stopAnswer?: (() => void) | undefined
  readonly language: string
  readonly now?: () => number
  /** Runs `run` after `ms`; the returned function calls it off. A timer unless a test says otherwise. */
  readonly later?: (run: () => void, ms: number) => () => void
  readonly voiceActivity?: VoiceActivityOptions
  readonly speaker?: (options: SpeakerOptions) => Speaker
}

export interface Conversation {
  subscribe(listener: () => void): () => void
  getSnapshot(): ConversationSnapshot
  /** Call in the press itself: the browser lets audio play and asks for the microphone. */
  start(): Promise<void>
  stop(): void
  /** While the owl thinks or speaks: back to listening. */
  interrupt(): void
  /** While the user speaks: done, without waiting for the pause. */
  endUtterance(): void
  /** The chat's view of the answer; call whenever it changes. */
  answer(update: AnswerUpdate): void
}

/** Kept in front of the first loud moment, so the first syllable is not cut off. */
const PRE_ROLL_MS = 400
/** The server takes 60 seconds; an utterance is ended a little before. */
export const MAX_UTTERANCE_MS = 55_000
/**
 * The chat reports "no longer writing" and the stored answer in two steps that may arrive apart. Only when no
 * answer has shown up this long after the writing ended did the turn fail.
 */
const ANSWER_GRACE_MS = 1_500
/** While nobody speaks the recording is started over this often, so it never grows. */
const IDLE_RESTART_MS = 20_000

const OFF: ConversationSnapshot = { state: 'off', level: 0, caption: '', captionBy: null, problem: null }

interface Turn {
  readonly answerIdAtStart: string | null
  readonly speaker: Speaker
  readonly spoken: string[]
  /** The owl's own words as far as they were written; what the app adds to the stored answer is not among them. */
  written: string
  sawRunning: boolean
  sendSettled: boolean
  closed: boolean
  /** Calls off the wait for a stored answer. */
  giveUp: (() => void) | null
}

export function createConversation(deps: ConversationDeps): Conversation {
  const now = deps.now ?? (() => Date.now())
  const makeSpeaker = deps.speaker ?? createSpeaker
  const later =
    deps.later ??
    ((run: () => void, ms: number) => {
      const timer = setTimeout(run, ms)
      return () => clearTimeout(timer)
    })
  const activity = createVoiceActivity(deps.voiceActivity ?? DEFAULT_VOICE_ACTIVITY)
  const listeners = new Set<() => void>()
  let snapshot = OFF
  let session: MicrophoneSession | null = null
  let output: ReturnType<ServerVoice['output']> = null
  let turn: Turn | null = null
  let latest: AnswerUpdate = { text: '', running: false, answerId: null }
  let listeningSince = 0
  let hearingSince = 0
  /** Counts up whenever the conversation moves on; a late answer of an earlier step is dropped by it. */
  let step = 0

  function set(next: Partial<ConversationSnapshot>): void {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  function listen(problem: ConversationProblem | null = snapshot.problem): void {
    step += 1
    turn?.giveUp?.()
    turn = null
    activity.reset()
    session?.restart()
    listeningSince = now()
    set({ state: 'listening', level: 0, problem })
  }

  async function understand(): Promise<void> {
    if (!session) return
    const mine = ++step
    const lastMs = now() - hearingSince + PRE_ROLL_MS
    activity.reset()
    set({ state: 'understanding', level: 0 })
    let text: string
    try {
      text = (await deps.hear(await session.take(lastMs), deps.language)).trim()
    } catch {
      if (step === mine) listen('understanding')
      return
    }
    if (step !== mine) return
    if (text === '') return listen(null)
    await ask(text)
  }

  async function ask(text: string): Promise<void> {
    if (!output) return
    const mine = ++step
    const mySpeaker = makeSpeaker({
      voice: deps.voice,
      output,
      language: deps.language,
      now,
      onPassage: (passage) => step === mine && set({ state: 'speaking', caption: passage, captionBy: 'owl' }),
    })
    const myTurn: Turn = { answerIdAtStart: latest.answerId, speaker: mySpeaker, spoken: [], written: '', sawRunning: false, sendSettled: false, closed: false, giveUp: null }
    turn = myTurn
    set({ state: 'thinking', caption: text, captionBy: 'user', problem: null })
    let reached: boolean | void
    try {
      reached = await deps.send(text)
    } catch {
      reached = false
    }
    if (step !== mine) return
    if (reached === false) {
      mySpeaker.stop()
      return listen('answer')
    }
    myTurn.sendSettled = true
    follow()
  }

  /** Hands the speaker what can be said of the answer by now, and closes the turn once the answer is done. */
  function follow(): void {
    const current = turn
    if (!current || current.closed) return
    if (latest.running) {
      current.sawRunning = true
      current.written = latest.text
    }
    // Before the chat has started to write, "not running" is the turn before, not the end of this one.
    const done = !latest.running && (current.sawRunning || current.sendSettled)
    const isNew = latest.answerId !== current.answerIdAtStart
    current.giveUp?.()
    current.giveUp = null
    if (done && !isNew) {
      // The chat is through and no answer is stored yet. If none follows, the turn failed.
      const mine = step
      current.giveUp = later(() => {
        if (step !== mine || current.closed) return
        current.closed = true
        current.speaker.stop()
        listen('answer')
      }, ANSWER_GRACE_MS)
      return
    }
    if (!latest.running && !done) return
    // A written answer is spoken as it was written. The stored one may end in notes the app adds for the reader
    // ("Unverändert gelassen, weil schon eingetragen: …"); they stay in the chat. Only an answer that was never
    // written out in front of the user is spoken from what is stored.
    const text = latest.running || current.written.trim() !== '' ? current.written : isNew ? latest.text : ''
    for (const passage of passagesAfter(current.spoken, speakablePassages(text, done, deps.language))) {
      current.spoken.push(passage)
      current.speaker.say(passage)
    }
    if (!done) return
    current.closed = true
    const mine = step
    current.speaker.finish().then(
      () => step === mine && listen(null),
      () => step === mine && listen('voice'),
    )
  }

  function onLevel(level: number): void {
    const { state } = snapshot
    if (state === 'speaking') return set({ level: turn?.speaker.level() ?? 0 })
    if (state !== 'listening' && state !== 'hearing') return
    const time = now()
    const event = activity.push(level, time)
    if (event === 'start') {
      hearingSince = activity.speakingSince ?? time
      return set({ state: 'hearing', level, problem: null })
    }
    if (event === 'end' || (state === 'hearing' && time - hearingSince > MAX_UTTERANCE_MS)) return void understand()
    if (state === 'listening' && time - listeningSince > IDLE_RESTART_MS) {
      session?.restart()
      listeningSince = time
    }
    set({ level })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    async start() {
      if (snapshot.state !== 'off') return
      const mine = ++step
      // In the press itself: the audio element is unlocked before the first answer exists.
      output = deps.voice.output()
      set({ ...OFF, state: 'starting' })
      try {
        if (!output) throw new Error('this browser cannot play audio')
        const opened = await deps.microphone.open(onLevel)
        if (step !== mine) return opened.close()
        session = opened
      } catch {
        if (step === mine) set({ ...OFF, problem: 'microphone' })
        return
      }
      listen(null)
    },
    stop() {
      step += 1
      turn?.giveUp?.()
      turn?.speaker.stop()
      turn = null
      session?.close()
      session = null
      output = null
      activity.reset()
      set(OFF)
    },
    interrupt() {
      if (snapshot.state !== 'thinking' && snapshot.state !== 'speaking') return
      turn?.speaker.stop()
      if (latest.running) deps.stopAnswer?.()
      listen(null)
    },
    endUtterance() {
      if (snapshot.state === 'hearing') void understand()
    },
    answer(update) {
      latest = update
      follow()
    },
  }
}
