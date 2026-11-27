import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@steuereule/ui'
import { Icon, ICON_PATHS, type IconName } from './Icon'

const NAMES = Object.keys(ICON_PATHS) as IconName[]

// The test build stubs react-native-svg (its geometry never reaches jsdom), so the drawing is checked
// as data and the accessibility on the wrapper the app really renders.
describe('the icon catalog', () => {
  it.each(NAMES)('"%s" is drawn inside the 24 px grid with path commands only', (name) => {
    const paths = ICON_PATHS[name]
    expect(paths.length).toBeGreaterThan(0)
    for (const d of paths) {
      expect(d, `${name}: a path starts with an absolute move`).toMatch(/^M-?\d/)
      expect(d, `${name}: only path commands and numbers`).toMatch(/^[MLHVZACmlhvzac0-9 .,-]+$/)
      const start = /^M(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/.exec(d)!
      for (const n of [Number(start[1]), Number(start[2])]) expect(n >= 0 && n <= 24, `${name}: ${d}`).toBe(true)
    }
  })

  it('has no two icons with the same drawing', () => {
    const drawings = NAMES.map((n) => ICON_PATHS[n].join('|'))
    expect(new Set(drawings).size).toBe(NAMES.length)
  })
})

describe('Icon', () => {
  it('is decoration beside its word: hidden from assistive tech, sized as asked', () => {
    render(
      <ThemeProvider mode="light">
        <Icon name="info" size={18} testID="icon" />
      </ThemeProvider>,
    )
    const icon = screen.getByTestId('icon')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.getAttribute('role')).toBeNull()
    expect(getComputedStyle(icon).width).toBe('18px')
    expect(getComputedStyle(icon).height).toBe('18px')
  })

  it('is an image with a name when it stands alone', () => {
    render(
      <ThemeProvider mode="light">
        <Icon name="info" label="Hinweis zur Testphase" />
      </ThemeProvider>,
    )
    const icon = screen.getByRole('img', { name: 'Hinweis zur Testphase' })
    expect(icon.getAttribute('aria-hidden')).toBeNull()
  })
})
