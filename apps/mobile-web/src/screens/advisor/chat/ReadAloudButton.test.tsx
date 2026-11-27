import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { createAppI18n } from '../../../i18n/app-i18n'
import { resetReadAloud } from '../../../lib/readAloud/readAloud'
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

const show = (node: React.ReactNode) => render(<I18nextProvider i18n={createAppI18n('de')}>{node}</I18nextProvider>)

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
})
