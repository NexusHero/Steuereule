import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { EulenKarte } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { EulenModusScreen } from './EulenModusScreen'

const KARTEN_FIXTURE: readonly EulenKarte[] = [
  {
    id: 'k1',
    fingerprint: 'fp-homeoffice-1',
    trigger: 'rechtsaenderung',
    kategorie: 'cockpit_proaktiv',
    titel: 'Homeoffice-Tagespauschale 6 €',
    botschaft: 'Du hast 50 Tage im Homeoffice gearbeitet.',
    begruendung: 'weil die Pauschale dauerhaft angehoben wurde.',
    betragEur: 300,
    rechtsstandDatum: '01.01.2025',
    quelleUebersetzt: 'Jahressteuergesetz § 4 Abs. 5 Satz 1 Nr. 6b EStG',
    wege: [
      {
        name: 'Tagespauschale ansetzen',
        betragEur: 300,
        beschreibung: 'Einfacher Nachweis',
        risiko: 'sicher',
      },
      {
        name: 'Häusliches Arbeitszimmer prüfen',
        betragEur: 1260,
        beschreibung: 'Mittelpunkt der Tätigkeit',
        risiko: 'risiko',
      },
    ],
  },
  {
    id: 'k2',
    fingerprint: 'fp-spenden-2',
    trigger: 'vorjahresvergleich',
    kategorie: 'abruf_frage',
    titel: 'Spenden wie im Vorjahr?',
    botschaft: 'Im Vorjahr hattest du 200 € Spenden abgesetzt.',
    begruendung: 'weil Spenden als Sonderausgaben abzugsfähig sind.',
    betragEur: 60,
    rechtsstandDatum: '01.01.2025',
    quelleUebersetzt: 'Sonderausgaben nach § 10b EStG',
  },
]

function renderScreen(props: Partial<Parameters<typeof EulenModusScreen>[0]> = {}) {
  const i18n = createAppI18n('de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <EulenModusScreen taxYear={2025} initialKarten={KARTEN_FIXTURE} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('EulenModusScreen', () => {
  it('renders proactive questions with amount, message, and safe vs risky options', () => {
    renderScreen()
    expect(screen.getByText('Homeoffice-Tagespauschale 6 €')).toBeDefined()
    expect(screen.getByText(/\+300/)).toBeDefined()
    expect(screen.getByText('Du hast 50 Tage im Homeoffice gearbeitet.')).toBeDefined()
    expect(screen.getByText('Tagespauschale ansetzen')).toBeDefined()
    expect(screen.getByText('Häusliches Arbeitszimmer prüfen')).toBeDefined()
  })

  it('switches between tabs', () => {
    renderScreen()
    const fragenTab = screen.getByRole('tab', { name: 'Fragen an die Eule' })
    fireEvent.click(fragenTab)
    expect(screen.getByText('Steuer-Assistent')).toBeDefined()
  })

  it('navigates to next question', () => {
    renderScreen()
    const nextBtn = screen.getByText('Nächste Frage →')
    fireEvent.click(nextBtn)
    expect(screen.getByText('Spenden wie im Vorjahr?')).toBeDefined()
  })

  it('allows dismissing a question via Stimmt nicht (ADR-041)', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    renderScreen({ onDismissKarte: onDismiss })

    const dismissBtn = screen.getByRole('button', { name: 'Stimmt nicht' })
    fireEvent.click(dismissBtn)

    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledWith('fp-homeoffice-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('Du hast 50 Tage im Homeoffice gearbeitet.')).toBeNull()
    })
  })
})
