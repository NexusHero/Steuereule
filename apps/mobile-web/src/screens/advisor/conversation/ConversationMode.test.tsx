import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import type { ConversationDeps, AnswerUpdate } from '../../../lib/conversation/conversation'
import type { Speaker } from '../../../lib/conversation/speaker'
import { renderInApp } from '../../../../test/test-render'
import { ConversationMode } from './ConversationMode'
import { hearOnServer } from './useConversation'

const NO_ANSWER: AnswerUpdate = { text: '', running: false, answerId: null }

/** The surface with a microphone the test drives and a chat that takes what was said. */
function stage({ microphone = true, said = null as { text: string; masked?: Array<{ start: number; end: number; as: string }> } | null } = {}) {
  let level: ((value: number) => void) | null = null
  let time = 0
  const session = { take: vi.fn(async () => new Blob(['wav'])), restart: vi.fn(), close: vi.fn() }
  const sent: string[] = []
  const speakers: Array<{ onPassage: (passage: string) => void; stopped: boolean }> = []
  const stopAnswer = vi.fn()
  const deps: ConversationDeps = {
    microphone: {
      open: async (onLevel) => {
        if (!microphone) throw new Error('NotAllowedError')
        level = onLevel
        return session
      },
    },
    hear: async () => 'Ich bin 38 Kilometer gefahren.',
    voice: { passage: () => Promise.reject(new Error('unused')), output: () => ({ play: () => Promise.resolve(), stop: () => undefined }) },
    send: (text) => {
      sent.push(text)
      return true
    },
    stopAnswer,
    language: 'de',
    now: () => time,
    speaker: ({ onPassage }): Speaker => {
      const mine = { onPassage, stopped: false }
      speakers.push(mine)
      return { say: () => undefined, finish: () => new Promise<void>(() => undefined), stop: () => void (mine.stopped = true), level: () => 0.2 }
    },
  }
  const onClose = vi.fn()
  // The chat's view of the answer changes while the surface stays mounted.
  let setAnswer: (next: AnswerUpdate) => void = () => undefined
  function Host() {
    const [current, set] = useState(NO_ANSWER)
    setAnswer = set
    return <ConversationMode deps={deps} answer={current} said={said} onClose={onClose} />
  }
  const view = renderInApp(<Host />)
  const mic = async (value: number, ms: number): Promise<void> => {
    await act(async () => {
      for (let passed = 0; passed < ms; passed += 50) {
        time += 50
        level?.(value)
      }
      for (let i = 0; i < 10; i += 1) await Promise.resolve()
    })
  }
  const answer = (update: Partial<AnswerUpdate>): void => act(() => setAnswer({ ...NO_ANSWER, ...update }))
  const start = async (): Promise<void> => {
    await act(async () => {
      fireEvent.click(screen.getByTestId('eule-gespraech-start'))
      for (let i = 0; i < 10; i += 1) await Promise.resolve()
    })
  }
  return { view, session, sent, speakers, stopAnswer, onClose, mic, answer, start }
}

const state = (): string | null => screen.getByTestId('eule-gespraech-zustand').textContent
const caption = (): string | null => screen.getByTestId('eule-gespraech-text').textContent

afterEach(() => vi.unstubAllGlobals())

describe('speaking with the owl', () => {
  it('opens with what leaves the device, and starts only with a press', () => {
    const { session } = stage()
    expect(screen.getByTestId('eule-gespraech-hinweis').textContent).toMatch(/geht zur Erkennung an den Sprachdienst.*speichern die Aufnahme nicht/)
    expect(screen.queryByTestId('eule-gespraech-linie')).toBeNull()
    expect(session.take).not.toHaveBeenCalled()
  })

  it('listens, hears, writes down, thinks and speaks, and says each in a word', async () => {
    const { start, mic, sent, answer, speakers } = stage()
    await start()
    expect(state()).toBe('Hört zu')
    expect(screen.getByTestId('eule-gespraech-linie')).toBeTruthy()
    await mic(0.1, 300)
    expect(state()).toBe('Hört dich')
    await mic(0.001, 1_000)
    expect(sent).toEqual(['Ich bin 38 Kilometer gefahren.'])
    expect(state()).toBe('Denkt nach …')
    expect(caption()).toBe('Ich bin 38 Kilometer gefahren.')
    answer({ running: true, text: 'Das sind rund 3.030 Euro. Soll ich' })
    act(() => speakers[0]?.onPassage('Das sind rund 3.030 Euro.'))
    expect(state()).toBe('Spricht')
    expect(caption()).toBe('Das sind rund 3.030 Euro.')
  })

  it('strikes through in what was said what did not go to the owl\'s model, and says the speech service heard it', async () => {
    const heard = 'Ich bin 38 Kilometer gefahren.'
    const { start, mic } = stage({ said: { text: heard, masked: [{ start: 8, end: 20, as: '[ADRESSE-GESCHÜTZT]' }] } })
    await start()
    expect(screen.queryByTestId('advisor-masked')).toBeNull()
    await mic(0.1, 300)
    await mic(0.001, 1_000)
    expect(caption()).toBe(heard)
    expect(screen.getByTestId('advisor-masked').textContent).toBe('38 Kilometer')
    expect(screen.getByTestId('advisor-masked-note').textContent).toMatch(/Der Sprachdienst hat es zur Erkennung gehört/)
  })

  it('marks nothing when the chat\'s latest message is not what was just said', async () => {
    const { start, mic } = stage({ said: { text: 'Eine ältere Nachricht.', masked: [{ start: 0, end: 4, as: 'x' }] } })
    await start()
    await mic(0.1, 300)
    await mic(0.001, 1_000)
    expect(caption()).toBe('Ich bin 38 Kilometer gefahren.')
    expect(screen.queryByTestId('advisor-masked')).toBeNull()
    expect(screen.queryByTestId('advisor-masked-note')).toBeNull()
  })

  it('offers „Fertig“ only while it hears, and „Unterbrechen“ only while the owl thinks or speaks', async () => {
    const { start, mic, stopAnswer, answer, speakers } = stage()
    await start()
    expect(screen.queryByTestId('eule-gespraech-fertig')).toBeNull()
    expect(screen.queryByTestId('eule-gespraech-unterbrechen')).toBeNull()
    await mic(0.1, 300)
    await act(async () => {
      fireEvent.click(screen.getByTestId('eule-gespraech-fertig'))
      for (let i = 0; i < 10; i += 1) await Promise.resolve()
    })
    expect(state()).toBe('Denkt nach …')
    answer({ running: true, text: 'Das sind rund 3.030 Euro. Soll ich' })
    fireEvent.click(screen.getByTestId('eule-gespraech-unterbrechen'))
    expect(speakers[0]?.stopped).toBe(true)
    expect(stopAnswer).toHaveBeenCalledOnce()
    expect(state()).toBe('Hört zu')
  })

  it('„Beenden“ releases the microphone and goes back to the chat', async () => {
    const { start, session, onClose } = stage()
    await start()
    fireEvent.click(screen.getByTestId('eule-gespraech-ende'))
    expect(session.close).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('leaving the screen releases the microphone', async () => {
    const { start, session, view } = stage()
    await start()
    view.unmount()
    expect(session.close).toHaveBeenCalledOnce()
  })

  it('says in words that the microphone is refused, and lets the user try again or go back', async () => {
    const { start, onClose } = stage({ microphone: false })
    await start()
    expect(screen.getByTestId('eule-gespraech-problem').textContent).toMatch(/Mikrofon ist nicht freigegeben/)
    expect(screen.getByTestId('eule-gespraech-start')).toBeTruthy()
    fireEvent.click(screen.getByTestId('eule-gespraech-ende'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('having an utterance written down by the server', () => {
  it('sends the language before the recording and answers the words', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ text: 'Hallo Eule.' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await hearOnServer(new Blob(['wav'], { type: 'audio/wav' }), 'de-DE')).toBe('Hallo Eule.')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toMatch(/\/v1\/eulen-modus\/gehoert$/)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    const form = init.body as FormData
    expect([...form.keys()]).toEqual(['language', 'file'])
    expect(form.get('language')).toBe('de')
    expect((form.get('file') as File).name).toBe('aufnahme.wav')
    await hearOnServer(new Blob(['wav']), 'en')
    expect((fetchMock.mock.calls[1]![1].body as FormData).get('language')).toBe('en')
  })

  it('rejects a refusal, and takes an answer without text for nothing said', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(hearOnServer(new Blob(['wav']), 'de')).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    expect(await hearOnServer(new Blob(['wav']), 'de')).toBe('')
  })
})
