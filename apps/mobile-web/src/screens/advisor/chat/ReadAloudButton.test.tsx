import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { createAppI18n } from '../../../i18n/app-i18n'
import { resetReadAloud } from '../../../lib/readAloud/readAloud'
import { apiServerVoice } from '../../../lib/readAloud/serverVoice'
import { OwlVoiceContext } from '../../../lib/readAloud/useOwlVoice'
import { ReadAloudButton } from './ReadAloudButton'

interface Spoken {
  readonly text: string
}

function stubSpeech(voices: Array<{ lang: string }>) {
  const spoken: Spoken[] = []
  const cancel = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak: (u: Spoken) => void spoken.push(u), cancel, getVoices: () => voices })
  vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; voice = null; constructor(readonly text: string) {} addEventListener(): void {} })
  return { spoken, cancel }
}

/** `voice`: the screen has the owl's voice from the server (ADR-0115). */
function show(node: React.ReactNode, { voice = false } = {}) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <OwlVoiceContext.Provider value={voice ? apiServerVoice : null}>{node}</OwlVoiceContext.Provider>
    </I18nextProvider>,
  )
}

afterEach(() => {
  resetReadAloud()
  vi.unstubAllGlobals()
})

describe('„Vorlesen“ under an answer', () => {
  it('reads the answer as spoken text, and stops on the second press', () => {
    const { spoken, cancel } = stubSpeech([{ lang: 'de-DE' }])
    show(<ReadAloudButton id="a1" content="**Ja**, nach [estg-9-1]." />)
    const button = screen.getByTestId('advisor-message-read-aloud')
    expect(button.textContent).toBe('Vorlesen')
    fireEvent.click(button)
    expect(spoken.map((u) => u.text)).toEqual(['Ja, nach Paragraf 9 Absatz 1 Einkommensteuergesetz.'])
    expect(button.textContent).toBe('Stopp')
    expect(button.getAttribute('aria-label')).toBe('Vorlesen beenden')
    cancel.mockClear()
    fireEvent.click(button)
    expect(cancel).toHaveBeenCalledOnce()
    expect(button.textContent).toBe('Vorlesen')
  })

  it('marks only the answer that is being read, and stops when that answer leaves the screen', () => {
    const { cancel } = stubSpeech([{ lang: 'de-DE' }])
    const view = show(
      <>
        <ReadAloudButton id="a1" content="Eins." />
        <ReadAloudButton id="a2" content="Zwei." />
      </>,
    )
    const [first, second] = screen.getAllByTestId('advisor-message-read-aloud')
    fireEvent.click(second!)
    expect(first!.textContent).toBe('Vorlesen')
    expect(second!.textContent).toBe('Stopp')
    cancel.mockClear()
    view.unmount()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('is absent where the device has no German voice or no speech at all', () => {
    stubSpeech([{ lang: 'en-US' }])
    const view = show(<ReadAloudButton id="a1" content="Eins." />)
    expect(screen.queryByTestId('advisor-message-read-aloud')).toBeNull()
    view.unmount()
    vi.unstubAllGlobals()
    show(<ReadAloudButton id="a1" content="Eins." />)
    expect(screen.queryByTestId('advisor-message-read-aloud')).toBeNull()
  })

  it('with the owl\'s voice it is there without any voice on the device, and asks the server for the spoken text', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(new Blob(['RIFF']), { status: 200, headers: { 'Content-Type': 'audio/wav' } }))
    vi.stubGlobal('fetch', fetchMock)
    const played: string[] = []
    vi.stubGlobal('Audio', class { src = ''; addEventListener(): void {} play(): Promise<void> { played.push(this.src); return Promise.resolve() } pause(): void {} })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:passage')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    show(<ReadAloudButton id="a1" content="**Ja**, nach [estg-9-1]." />, { voice: true })
    const button = screen.getByTestId('advisor-message-read-aloud')
    fireEvent.click(button)
    expect(button.textContent).toBe('Stopp')
    await waitFor(() => expect(played).toContain('blob:passage'))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toMatch(/\/v1\/eulen-modus\/stimme$/)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Ja, nach Paragraf 9 Absatz 1 Einkommensteuergesetz.', language: 'de' })
    // The element is unlocked in the press itself, before the audio is there.
    expect(played[0]).toMatch(/^data:audio\/wav/)
    fireEvent.click(button)
    expect(button.textContent).toBe('Vorlesen')
    vi.restoreAllMocks()
  })
})
