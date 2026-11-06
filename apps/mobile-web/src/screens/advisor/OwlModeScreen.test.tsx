import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { OwlCardsDisplay } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { OwlModeScreen } from './OwlModeScreen'

const CARDS_FIXTURE: readonly OwlCardsDisplay[] = [
  {
    id: 'k1',
    fingerprint: 'fp-homeoffice-1',
    trigger: 'rechtsaenderung',
    category: 'cockpit_proaktiv',
    title: 'Homeoffice-Tagespauschale 6 €',
    message: 'Du hast 50 Tage im Homeoffice gearbeitet.',
    reason: 'weil die Pauschale dauerhaft angehoben wurde.',
    amountEur: 300,
    legalStatusDate: '01.01.2025',
    sourceTranslated: 'Jahressteuergesetz § 4 Abs. 5 Satz 1 Nr. 6b EStG',
    paths: [
      {
        name: 'Tagespauschale ansetzen',
        amountEur: 300,
        description: 'Einfacher Nachweis',
        risk: 'sicher',
      },
      {
        name: 'Häusliches Arbeitszimmer prüfen',
        amountEur: 1260,
        description: 'Mittelpunkt der Tätigkeit',
        risk: 'risiko',
      },
    ],
  },
  {
    id: 'k2',
    fingerprint: 'fp-spenden-2',
    trigger: 'vorjahresvergleich',
    category: 'abruf_frage',
    title: 'Spenden wie im Vorjahr?',
    message: 'Im Vorjahr hattest du 200 € Spenden abgesetzt.',
    reason: 'weil Spenden als Sonderausgaben abzugsfähig sind.',
    amountEur: 60,
    legalStatusDate: '01.01.2025',
    sourceTranslated: 'Sonderausgaben nach § 10b EStG',
  },
]

function renderScreen(props: Partial<Parameters<typeof OwlModeScreen>[0]> = {}) {
  const i18n = createAppI18n('de')
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <OwlModeScreen taxYear={2025} initialCards={CARDS_FIXTURE} {...props} />
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
    const questionsTab = screen.getByRole('tab', { name: 'Fragen an die Eule' })
    fireEvent.click(questionsTab)
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
    renderScreen({ onDismissCard: onDismiss })

    const dismissBtn = screen.getByRole('button', { name: 'Stimmt nicht' })
    fireEvent.click(dismissBtn)

    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledWith('fp-homeoffice-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('Du hast 50 Tage im Homeoffice gearbeitet.')).toBeNull()
    })
  })

  it('signs every advisor surface with the owl (AiChip "Die Eule"), never the old B dot', () => {
    renderScreen()
    expect(screen.getByTestId('eule-sender-card')).toBeDefined()
    expect(screen.getAllByTestId('owl-glyph').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Fragen an die Eule' }))
    expect(screen.getByTestId('eule-sender-chat')).toBeDefined()
    expect(screen.queryByText('B')).toBeNull()
  })
})
