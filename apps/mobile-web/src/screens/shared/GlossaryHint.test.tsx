import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { GlossaryHint, hasGlossaryEntry } from './GlossaryHint'

describe('GlossaryHint (UX review M2 — „Was heißt das?“)', () => {
  it('provides glossary entries for top tax terms and toggles explanation with example on click', () => {
    expect(hasGlossaryEntry('dhf')).toBe(true)
    expect(hasGlossaryEntry('lohnersatz')).toBe(true)
    expect(hasGlossaryEntry('riester-art')).toBe(true)
    expect(hasGlossaryEntry('gesundheit-gate')).toBe(true)

    render(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <GlossaryHint stepId="dhf" />
        </ThemeProvider>
      </I18nextProvider>,
    )

    const toggle = screen.getByTestId('glossar-toggle-dhf')
    expect(toggle.textContent).toContain('Was heißt das?')
    expect(screen.queryByTestId('glossar-text-dhf')).toBeNull()

    fireEvent.click(toggle)
    const box = screen.getByTestId('glossar-text-dhf')
    expect(box.textContent).toContain('Zweitwohnung am Arbeitsort')
    expect(box.textContent).toContain('1.000 €/Monat')
  })
})
