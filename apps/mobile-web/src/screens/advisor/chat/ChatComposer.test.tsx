import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../../i18n/app-i18n'
import { ChatComposer } from './ChatComposer'
import type { ChatInputPlatform } from './chatKeys'

function Host({
  platform,
  sending = false,
  onSend,
  onStop,
  variant,
}: {
  readonly platform: ChatInputPlatform
  readonly sending?: boolean
  readonly onSend: (text: string) => void
  readonly onStop?: () => void
  readonly variant?: 'panel' | 'dock'
}) {
  const [value, setValue] = useState('')
  return (
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <ChatComposer
          value={value}
          onChangeText={setValue}
          onSend={(text) => {
            onSend(text)
            setValue('')
          }}
          onStop={onStop}
          sending={sending}
          placeholder="Frag die Eule"
          inputTestID="input"
          sendTestID="send"
          platform={platform}
          variant={variant}
        />
      </ThemeProvider>
    </I18nextProvider>
  )
}

const input = () => screen.getByTestId('input') as HTMLTextAreaElement

describe('ChatComposer (#451 slice 1)', () => {
  it('sends on Enter on a desktop and clears the field', () => {
    const onSend = vi.fn()
    render(<Host platform="desktop" onSend={onSend} />)
    fireEvent.change(input(), { target: { value: 'Laptop absetzen?' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Laptop absetzen?')
    expect(input().value).toBe('')
  })

  it('keeps Shift+Enter as a line break on a desktop', () => {
    const onSend = vi.fn()
    render(<Host platform="desktop" onSend={onSend} />)
    fireEvent.change(input(), { target: { value: 'Zeile 1' } })
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('never sends with Enter on a phone; only the button sends', () => {
    const onSend = vi.fn()
    render(<Host platform="touch" variant="dock" onSend={onSend} />)
    fireEvent.change(input(), { target: { value: 'Kurze Frage' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('send'))
    expect(onSend).toHaveBeenCalledWith('Kurze Frage')
  })

  it('is a multiline field', () => {
    render(<Host platform="desktop" onSend={vi.fn()} />)
    expect(input().tagName).toBe('TEXTAREA')
    expect(input().getAttribute('enterkeyhint')).toBe('send')
  })

  it('turns the send button into Stop while answering, and Escape stops too', () => {
    const onStop = vi.fn()
    render(<Host platform="desktop" sending onSend={vi.fn()} onStop={onStop} />)
    expect(screen.queryByTestId('send')).toBeNull()
    fireEvent.click(screen.getByTestId('advisor-chat-stop'))
    expect(onStop).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onStop).toHaveBeenCalledTimes(2)
  })

  it('does not send a second question while one is running', () => {
    const onSend = vi.fn()
    render(<Host platform="desktop" sending onSend={onSend} />)
    fireEvent.change(input(), { target: { value: 'Noch was' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('ChatComposer height in a browser (#476)', () => {
  /**
   * A textarea like a real one: its scrollHeight is the text plus padding, and never smaller than
   * the box. That second property is what made the input ratchet up to five lines on its own.
   */
  function withBrowserTextarea(linesOf: (value: string) => number, run: () => void) {
    const PADDING = 24
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        const content = linesOf(this.value) * 20 + PADDING
        return Math.max(content, Number.parseFloat(this.style.height) || 0)
      },
    })
    try {
      run()
    } finally {
      if (descriptor) Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', descriptor)
      else delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
    }
  }

  const heightOf = (): number => Number.parseFloat((screen.getByTestId('input') as HTMLTextAreaElement).style.height)

  it('is one line while empty, however long the placeholder wraps', () => {
    withBrowserTextarea(() => 4, () => {
      render(<Host platform="desktop" onSend={vi.fn()} />)
      expect(heightOf()).toBe(44)
    })
  })

  it('grows with the text, stops at five lines, and shrinks again when text is removed', () => {
    withBrowserTextarea((value) => Math.max(1, value.split('\n').length), () => {
      render(<Host platform="desktop" onSend={vi.fn()} />)
      const input = screen.getByTestId('input')

      fireEvent.change(input, { target: { value: 'eins\nzwei\ndrei' } })
      expect(heightOf()).toBe(3 * 20 + 24)

      fireEvent.change(input, { target: { value: Array.from({ length: 9 }, (_, i) => `Zeile ${i}`).join('\n') } })
      expect(heightOf()).toBe(5 * 20 + 24)

      fireEvent.change(input, { target: { value: 'eins' } })
      expect(heightOf()).toBe(44)
    })
  })

  it('does not grow by itself when the same text is rendered again', () => {
    withBrowserTextarea(() => 1, () => {
      const view = render(<Host platform="desktop" onSend={vi.fn()} />)
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'eins' } })
      const first = heightOf()
      view.rerender(<Host platform="desktop" onSend={vi.fn()} />)
      view.rerender(<Host platform="desktop" onSend={vi.fn()} />)
      expect(heightOf()).toBe(first)
    })
  })
})
