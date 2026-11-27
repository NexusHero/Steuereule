import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
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

  it('BetaBadge shows the word alone and says whether the notice is open', () => {
    function Held() {
      const [open, setOpen] = useState(false)
      return <BetaBadge open={open} onToggle={() => setOpen((o) => !o)} />
    }
    renderWithQuery(<Held />)
    // The visible word is part of the name (WCAG 2.5.3).
    const badge = screen.getByRole('button', { name: 'BETA: Hinweis zur Testphase' })
    expect(badge.textContent).toBe('BETA')
    expect(badge.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(badge)
    expect(badge.getAttribute('aria-expanded')).toBe('true')
  })
})
