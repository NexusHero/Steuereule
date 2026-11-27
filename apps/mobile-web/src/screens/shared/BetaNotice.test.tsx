import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithQuery } from '../../../test/test-render'
import { BetaNotice } from './BetaNotice'

describe('BetaNotice', () => {
  it('is written out by default: where a decision follows, nobody has to tap for it (WEB-20)', () => {
    renderWithQuery(<BetaNotice />)
    expect(screen.getByTestId('beta-hinweis').textContent).toContain('SteuerEule ist in der Testphase.')
    expect(screen.queryByTestId('beta-marke')).toBeNull()
  })

  it('compact: a BETA mark that opens and closes the same notice', () => {
    renderWithQuery(<BetaNotice compact />)
    const mark = screen.getByRole('button', { name: 'Beta: Was heißt das?' })
    expect(mark.textContent).toContain('BETA')
    expect(mark.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByTestId('beta-hinweis').textContent).not.toContain('Testphase')

    fireEvent.click(mark)
    expect(mark.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('beta-hinweis').textContent).toContain('Prüfe jeden Ausdruck, bevor du ihn unterschreibst und einreichst.')

    fireEvent.click(mark)
    expect(screen.getByTestId('beta-hinweis').textContent).not.toContain('Testphase')
  })

  it('compact: the mark is a touch-sized target', () => {
    renderWithQuery(<BetaNotice compact />)
    expect(Number.parseFloat(getComputedStyle(screen.getByTestId('beta-marke')).minHeight)).toBeGreaterThanOrEqual(44)
  })
})
