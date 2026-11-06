import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { OwlGlyph } from './OwlGlyph'

describe('OwlGlyph', () => {
  it('scales from its 16px master and stays decorative', () => {
    const { getByTestId } = render(<OwlGlyph size={32} ink="#4630b8" ground="#ece6ff" />)
    const el = getByTestId('owl-glyph')
    expect(el.getAttribute('style')).toContain('width: 32px')
    expect(el.getAttribute('aria-hidden') ?? el.getAttribute('aria-label')).not.toBe('B')
  })
})
