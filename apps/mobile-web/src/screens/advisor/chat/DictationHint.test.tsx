import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../../i18n/app-i18n'
import { DictationHint } from './DictationHint'
import { DICTATION_HINT_STORAGE_KEY } from './dictationHintStorage'

function renderHint(platform: 'desktop' | 'touch') {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <DictationHint platform={platform} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

afterEach(() => globalThis.localStorage?.removeItem(DICTATION_HINT_STORAGE_KEY))

describe('DictationHint (#451 slice 4, AC 7)', () => {
  it('points phone users at the keyboard microphone', () => {
    renderHint('touch')
    expect(screen.getByTestId('advisor-dictation-hint').textContent).toContain('Mikrofon deiner Tastatur')
  })

  it('points computer users at the system dictation', () => {
    renderHint('desktop')
    expect(screen.getByTestId('advisor-dictation-hint').textContent).toContain('Diktierfunktion')
  })

  it('is dismissed once and stays away', () => {
    const first = renderHint('desktop')
    fireEvent.click(screen.getByTestId('advisor-dictation-hint-dismiss'))
    expect(screen.queryByTestId('advisor-dictation-hint')).toBeNull()
    first.unmount()
    renderHint('desktop')
    expect(screen.queryByTestId('advisor-dictation-hint')).toBeNull()
  })

  it('promises no microphone button of its own (AC 10)', () => {
    renderHint('touch')
    expect(screen.queryByTestId('advisor-dictation-mic')).toBeNull()
  })
})
