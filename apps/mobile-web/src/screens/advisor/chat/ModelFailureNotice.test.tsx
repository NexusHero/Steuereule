import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInApp } from '../../../test-render'
import { ModelFailureNotice } from './ModelFailureNotice'

describe('ModelFailureNotice (#486)', () => {
  it('says why the model did not answer, that the answer came from rules, and what failed technically', () => {
    renderInApp(<ModelFailureNotice failure={{ reason: 'quota', detail: 'Gemini · HTTP 429' }} answeredByRules onRetry={vi.fn()} />)
    expect(screen.getByTestId('advisor-model-failure-text').textContent).toContain('Kontingent')
    expect(screen.getByTestId('advisor-model-failure-text').textContent).toContain('festen Regeln')
    expect(screen.getByTestId('advisor-model-failure-detail').textContent).toContain('Gemini · HTTP 429')
  })

  it('offers to ask again when that can help', () => {
    const onRetry = vi.fn()
    renderInApp(<ModelFailureNotice failure={{ reason: 'unavailable' }} answeredByRules onRetry={onRetry} />)
    fireEvent.click(screen.getByTestId('advisor-model-failure-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers no retry for a refused key, and none for an older turn', () => {
    const { unmount } = renderInApp(<ModelFailureNotice failure={{ reason: 'not-configured' }} answeredByRules onRetry={vi.fn()} />)
    expect(screen.queryByTestId('advisor-model-failure-retry')).toBeNull()
    expect(screen.getByTestId('advisor-model-failure-text').textContent).toContain('Betreiber')
    unmount()
    renderInApp(<ModelFailureNotice failure={{ reason: 'unavailable' }} answeredByRules />)
    expect(screen.queryByTestId('advisor-model-failure-retry')).toBeNull()
  })

  it('does not claim a failed answer came from rules', () => {
    renderInApp(<ModelFailureNotice failure={{ reason: 'timeout' }} answeredByRules={false} />)
    expect(screen.getByTestId('advisor-model-failure-text').textContent).not.toContain('festen Regeln')
  })
})
