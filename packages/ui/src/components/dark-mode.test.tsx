import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '../theme/ThemeProvider'
import { Button } from './Button'
import { Chip } from './Chip'
import { Option } from './Option'
import { Sticker } from './Sticker'
import { TabBar } from './TabBar'

// jsdom serializes hex colours onto CSSStyleDeclaration.color as rgb(r, g, b).
const DARK_INK_ON_FUNKE_RGB = 'rgb(13, 15, 8)'
const DARK_TINTE_RGB = 'rgb(242, 240, 227)'
const DARK_TINTE2_RGB = 'rgb(169, 173, 153)'
const LIGHT_TINTE_RGB = 'rgb(25, 27, 18)'

describe('dark mode readability on lime (funke) surfaces', () => {
  it('uses dark ink on funke backgrounds in dark mode so text keeps >= 4.5:1 contrast', () => {
    render(
      <ThemeProvider mode="dark">
        <>
          <Button variant="primaer">Weiter</Button>
          <Button variant="ghost">Abbrechen</Button>
          <Chip active>Aktiv</Chip>
          <Chip>Inaktiv</Chip>
          <Option selected>Ja</Option>
          <Option>Nein</Option>
          <Sticker>+80 €</Sticker>
          <TabBar
            tabs={[
              { id: 'cockpit', label: 'Cockpit' },
              { id: 'profil', label: 'Profil' },
            ]}
            active="cockpit"
            onChange={() => {}}
          />
        </>
      </ThemeProvider>,
    )

    expect(getComputedStyle(screen.getByText('Weiter')).color).toBe(DARK_INK_ON_FUNKE_RGB)
    expect(getComputedStyle(screen.getByText('Abbrechen')).color).toBe(DARK_TINTE_RGB)
    // A chosen chip, option or tab sits on full lime again, so its state never rests on a soft tint.
    expect(getComputedStyle(screen.getByText('Aktiv')).color).toBe(DARK_INK_ON_FUNKE_RGB)
    expect(getComputedStyle(screen.getByText('Inaktiv')).color).toBe(DARK_TINTE_RGB)
    expect(getComputedStyle(screen.getByText('Ja')).color).toBe(DARK_INK_ON_FUNKE_RGB)
    expect(getComputedStyle(screen.getByText('Nein')).color).toBe(DARK_TINTE_RGB)
    expect(getComputedStyle(screen.getByText('+80 €')).color).toBe(DARK_INK_ON_FUNKE_RGB)
    expect(getComputedStyle(screen.getByText('Cockpit')).color).toBe(DARK_INK_ON_FUNKE_RGB)
    expect(getComputedStyle(screen.getByText('Profil')).color).toBe(DARK_TINTE2_RGB)
  })

  it('keeps light-mode ink unchanged on lime backgrounds', () => {
    render(
      <ThemeProvider mode="light">
        <Button variant="primaer">Weiter</Button>
      </ThemeProvider>,
    )
    expect(getComputedStyle(screen.getByText('Weiter')).color).toBe(LIGHT_TINTE_RGB)
  })
})

describe('a chosen state never rests on colour alone (WCAG 1.4.1)', () => {
  it('marks an active chip and a chosen option with a check, and announces the option as selected', () => {
    render(
      <ThemeProvider mode="light">
        <Chip active testID="c-an">An</Chip>
        <Chip testID="c-aus">Aus</Chip>
        <Option selected testID="o-an">Gewählt</Option>
        <Option testID="o-aus">Offen</Option>
      </ThemeProvider>,
    )
    expect(screen.getByTestId('c-an').textContent).toContain('✓')
    expect(screen.getByTestId('c-aus').textContent).not.toContain('✓')
    expect(screen.getByTestId('o-an').textContent).toContain('✓')
    expect(screen.getByTestId('o-an').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('o-aus').textContent).not.toContain('✓')
  })
})
