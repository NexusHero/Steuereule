import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../../i18n/app-i18n'
import { ContextRing, SummaryDivider, type ContextRingProps } from './ContextRing'

function renderRing(props: Partial<ContextRingProps> = {}) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <ContextRing context={{ percent: 42, level: 'ok', canSummarize: true }} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('ContextRing (#481)', () => {
  it('names how full the context is, for screen readers too', () => {
    renderRing()
    expect(screen.getByTestId('advisor-context-ring').getAttribute('aria-label')).toContain('42 %')
    expect(screen.queryByTestId('advisor-context-popover')).toBeNull()
  })

  it('explains itself when tapped', () => {
    renderRing()
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    expect(screen.getByTestId('advisor-context-percent').textContent).toContain('42 %')
    expect(screen.getByTestId('advisor-context-popover').textContent).toContain('fasst sie den älteren Teil zusammen')
  })

  it('warns when the context is almost full', () => {
    renderRing({ context: { percent: 86, level: 'warn', canSummarize: true } })
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    expect(screen.getByTestId('advisor-context-popover').textContent).toContain('fast voll')
  })

  it('summarises on request and closes', async () => {
    const onSummarize = vi.fn().mockResolvedValue(undefined)
    renderRing({ onSummarize })
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    fireEvent.click(screen.getByTestId('advisor-context-summarize'))
    expect(onSummarize).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByTestId('advisor-context-popover')).toBeNull())
  })

  it('offers no summary of a conversation that is too short, or while an answer is written', () => {
    const onSummarize = vi.fn()
    const { unmount } = renderRing({ onSummarize, context: { percent: 3, level: 'ok', canSummarize: false } })
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    fireEvent.click(screen.getByTestId('advisor-context-summarize'))
    expect(screen.getByTestId('advisor-context-popover').textContent).toContain('noch zu kurz')
    unmount()
    renderRing({ onSummarize, busy: true })
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    fireEvent.click(screen.getByTestId('advisor-context-summarize'))
    expect(onSummarize).not.toHaveBeenCalled()
  })

  it('says so when summarising failed', async () => {
    renderRing({ onSummarize: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    fireEvent.click(screen.getByTestId('advisor-context-summarize'))
    expect((await screen.findByTestId('advisor-context-failed')).textContent).toContain('nicht geklappt')
  })
})

describe('SummaryDivider (#481)', () => {
  const renderDivider = (summary?: string) =>
    render(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <SummaryDivider summary={summary} />
        </ThemeProvider>
      </I18nextProvider>,
    )

  it('marks where the summarised part ends and shows the summary on request', () => {
    renderDivider('- Arbeitsweg 38 km, übernommen')
    expect(screen.getByTestId('advisor-summary-divider').textContent).toContain('Älterer Verlauf zusammengefasst')
    expect(screen.queryByTestId('advisor-summary-text')).toBeNull()
    fireEvent.click(screen.getByTestId('advisor-summary-toggle'))
    expect(screen.getByTestId('advisor-summary-text').textContent).toContain('Arbeitsweg 38 km')
  })
})
