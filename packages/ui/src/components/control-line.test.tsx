import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { modeTokens, type ThemeMode } from '@steuereule/tokens'
import { Button } from './Button'
import { DateInput } from './DateInput'
import { Input } from './Input'
import { Option } from './Option'
import { renderUi } from '../test-utils'

// jsdom serializes a hex colour as rgb(r, g, b).
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

// A control is found by its edge (WCAG 1.4.11): the edge takes the control line, never the hairline
// that separates surfaces. packages/tokens proves the control line clears 3:1; this proves it is used.
describe.each(['light', 'dark'] as const satisfies readonly ThemeMode[])('control boundaries in %s mode', (mode) => {
  const c = modeTokens(mode).color
  const controlLine = rgb(c.tinte2)
  const hairline = rgb(c.linie)
  const border = (el: HTMLElement) => getComputedStyle(el).borderTopColor

  it('the hairline and the control line are different colours', () => {
    expect(controlLine).not.toBe(hairline)
  })

  it('a text field at rest', () => {
    renderUi(<Input value="" onChange={() => {}} testID="field" />, { mode })
    expect(border(screen.getByTestId('field'))).toBe(controlLine)
  })

  it('an option that is not chosen', () => {
    renderUi(<Option>Angestellt</Option>, { mode })
    expect(border(screen.getByRole('button', { name: 'Angestellt' }))).toBe(controlLine)
  })

  it('a ghost button', () => {
    renderUi(<Button variant="ghost">Bescheid prüfen</Button>, { mode })
    expect(border(screen.getByRole('button', { name: 'Bescheid prüfen' }))).toBe(controlLine)
  })

  it('the calendar button of a date field', () => {
    renderUi(<DateInput value="" onChange={() => {}} calendarLabel="Kalender öffnen" accessibilityLabel="Datum" testID="date" />, { mode })
    expect(border(screen.getByTestId('date-kalender-oeffnen'))).toBe(controlLine)
  })
})
