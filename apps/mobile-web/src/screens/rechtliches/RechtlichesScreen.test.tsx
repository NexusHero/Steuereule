import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { RechtlichesScreen } from './RechtlichesScreen'
import { betreiberAusUmgebung, inhalt, RECHTLICHE_SEITEN, type Betreiber, type RechtlicheSeite } from './texte'

const BETREIBER: Betreiber = {
  name: 'Eule GmbH',
  anschrift: 'Musterstraße 1\n12345 Musterstadt',
  email: 'hallo@steuereule.de',
}

function renderSeite(seite: RechtlicheSeite, betreiber: Betreiber | null = BETREIBER) {
  const onZurueck = vi.fn()
  const onSeite = vi.fn()
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <RechtlichesScreen seite={seite} betreiber={betreiber} onZurueck={onZurueck} onSeite={onSeite} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return { onZurueck, onSeite }
}

describe('betreiberAusUmgebung', () => {
  it('reads the operator from the build env, turning a literal \\n into address lines', () => {
    expect(
      betreiberAusUmgebung({
        EXPO_PUBLIC_BETREIBER_NAME: 'Eule GmbH',
        EXPO_PUBLIC_BETREIBER_ANSCHRIFT: 'Musterstraße 1\\n12345 Musterstadt',
        EXPO_PUBLIC_BETREIBER_EMAIL: 'hallo@steuereule.de',
      }),
    ).toEqual(BETREIBER)
  })

  it('is null when a mandatory § 5 DDG value is missing — never a half Impressum', () => {
    expect(betreiberAusUmgebung({ EXPO_PUBLIC_BETREIBER_NAME: 'Eule GmbH' })).toBeNull()
  })
})

describe('RechtlichesScreen', () => {
  it('the Impressum shows the configured operator', () => {
    renderSeite('impressum')
    expect(screen.getByText(/Eule GmbH/)).toBeTruthy()
    expect(screen.getByText('E-Mail: hallo@steuereule.de')).toBeTruthy()
  })

  it('without operator data the Impressum says so honestly instead of inventing one', () => {
    renderSeite('impressum', null)
    expect(screen.getByText('Die Anbieterangaben sind auf dieser Umgebung noch nicht hinterlegt.')).toBeTruthy()
  })

  it('links every other legal page and goes back', () => {
    const { onSeite, onZurueck } = renderSeite('agb')
    fireEvent.click(screen.getByText('Datenschutzerklärung'))
    expect(onSeite).toHaveBeenCalledWith('datenschutz')
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onZurueck).toHaveBeenCalled()
  })

  it('the AGB carry the § 356 Abs. 5 BGB withdrawal wording the Stripe checkout asks consent for', () => {
    renderSeite('agb')
    expect(screen.getByText(/§ 356 Abs\. 5 BGB/)).toBeTruthy()
  })
})

describe('legal texts stay honest about what the product does', () => {
  const alles = RECHTLICHE_SEITEN.flatMap((seite) => inhalt(seite, BETREIBER))
    .flatMap((abschnitt) => [abschnitt.titel, ...abschnitt.absaetze])
    .join('\n')

  it('never promise an electronic transmission to the Finanzamt (ADR-0050: Papierweg)', () => {
    expect(alles).not.toMatch(/übermitteln wir (deine|die) Erklärung|elektronisch an das Finanzamt übermittelt/)
    expect(alles).toMatch(/übermittelt keine Daten an das Finanzamt/)
  })

  it('name every real data recipient (Art. 13 Abs. 1 lit. e DSGVO)', () => {
    for (const empfaenger of ['Brevo', 'Stripe', 'Google', 'Have I Been Pwned']) {
      expect(alles).toContain(empfaenger)
    }
  })
})
