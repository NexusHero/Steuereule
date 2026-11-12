import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AdvisorMessageFeedback } from '@steuereule/core'
import { createAppI18n } from '../../../i18n/app-i18n'
import { FeedbackButtons, type FeedbackButtonsProps } from './FeedbackButtons'

function mount(feedback: AdvisorMessageFeedback | null, onRate: FeedbackButtonsProps['onRate']) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <FeedbackButtons feedback={feedback} onRate={onRate} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('FeedbackButtons (#476 decision 16)', () => {
  it('rates an unrated answer up or down', () => {
    const onRate = vi.fn()
    mount(null, onRate)
    fireEvent.click(screen.getByTestId('advisor-feedback-up'))
    fireEvent.click(screen.getByTestId('advisor-feedback-down'))
    expect(onRate.mock.calls).toEqual([['up', undefined], ['down', undefined]])
  })

  it('marks the stored rating and removes it when the same thumb is pressed again', () => {
    const onRate = vi.fn()
    mount({ rating: 'up' }, onRate)
    expect(screen.getByTestId('advisor-feedback-up').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('advisor-feedback-down').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByTestId('advisor-feedback-up'))
    expect(onRate).toHaveBeenCalledWith(null, undefined)
  })

  it('offers reasons only after a thumbs down, from the fixed list', () => {
    const onRate = vi.fn()
    const { rerender } = mount({ rating: 'up' }, onRate)
    expect(screen.queryByTestId('advisor-feedback-reasons')).toBeNull()
    rerender(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <FeedbackButtons feedback={{ rating: 'down' }} onRate={onRate} />
        </ThemeProvider>
      </I18nextProvider>,
    )
    expect(screen.getByTestId('advisor-feedback-reasons').textContent).toContain('Was hat nicht gepasst?')
    fireEvent.click(screen.getByTestId('advisor-feedback-reason-unklar'))
    expect(onRate).toHaveBeenCalledWith('down', 'unklar')
  })

  it('marks the stored reason', () => {
    mount({ rating: 'down', reason: 'falsch' }, vi.fn())
    expect(screen.getByTestId('advisor-feedback-reason-falsch').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('advisor-feedback-reason-unklar').getAttribute('aria-pressed')).toBe('false')
  })

  it('says so when the rating could not be stored, instead of pretending', async () => {
    mount(null, () => Promise.reject(new Error('offline')))
    fireEvent.click(screen.getByTestId('advisor-feedback-up'))
    await waitFor(() => expect(screen.getByTestId('advisor-feedback-failed').textContent).toContain('nicht gespeichert'))
    expect(screen.queryByTestId('advisor-feedback-thanks')).toBeNull()
  })
})
