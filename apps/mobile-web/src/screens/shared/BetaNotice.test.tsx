import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQuery } from '../../../test/test-render'
import { BetaBadge, BetaNotice } from './BetaNotice'

describe('the beta notice', () => {
  it('BetaNotice is written out: where a decision follows, the full text stands there (WEB-20)', () => {
    renderWithQuery(<BetaNotice />)
    const note = screen.getByTestId('beta-hinweis')
    expect(note.getAttribute('role')).toBe('note')
    expect(note.textContent).toContain('SteuerEule ist in der Testphase.')
    expect(note.textContent).toContain('Prüfe jeden Ausdruck, bevor du ihn unterschreibst und einreichst.')
  })

  it('BetaBadge is the word alone: no explanation, nothing to press', () => {
    renderWithQuery(<BetaBadge />)
    const badge = screen.getByTestId('beta-marke')
    expect(badge.textContent).toBe('BETA')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('beta-hinweis')).toBeNull()
  })
})
