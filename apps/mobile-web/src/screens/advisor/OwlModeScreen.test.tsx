import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { OwlCardsDisplay } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { OwlModeScreen } from './OwlModeScreen'
import { InMaskAdvisorCompanion } from './InMaskAdvisorCompanion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

function openWorkbench() {
  fireEvent.click(screen.getByTestId('eule-hints-pill'))
}

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

// Tablet width unless a test says otherwise: there the workbench is a sheet over the chat.
beforeEach(() => setViewportWidth(1024))
afterEach(() => setViewportWidth(0))

describe('EulenModusScreen', () => {
  describe('the chat is the screen (#476 decisions 1 to 4)', () => {
    it('opens on the chat itself: the greeting, the quick starts and the composer, with no tab to switch to', () => {
      renderScreen()
      expect(screen.getByTestId('advisor-empty-state').textContent).toContain('Womit kann die Eule helfen?')
      // Four quick starts under the centred input; the rest wait behind "Mehr …".
      expect(screen.queryByText('Fortbildung & Reisekosten klären')).toBeNull()
      fireEvent.click(screen.getByTestId('advisor-chips-more'))
      expect(screen.getByText('Fortbildung & Reisekosten klären')).toBeDefined()
      expect(screen.getByTestId('advisor-chat-input')).toBeDefined()
      expect(screen.queryByRole('tab')).toBeNull()
      expect(screen.queryByTestId('eule-hero')).toBeNull()
    })

    it('keeps the workbench closed until it is asked for, and says in the title bar how many hints wait', () => {
      renderScreen()
      expect(screen.queryByText('Homeoffice-Tagespauschale 6 €')).toBeNull()
      expect(screen.getByTestId('eule-hints-pill').getAttribute('aria-label')).toContain('2 Hinweise')
      expect(screen.getByTestId('eule-hints-pill').getAttribute('aria-expanded')).toBe('false')

      openWorkbench()
      expect(screen.getByTestId('eule-workbench-sheet')).toBeDefined()
      expect(screen.getByTestId('eule-hints-pill').getAttribute('aria-expanded')).toBe('true')
    })

    it('puts the workbench beside the chat on a wide screen and over it on a narrow one', () => {
      setViewportWidth(1440)
      const wide = renderScreen()
      openWorkbench()
      expect(screen.getByTestId('eule-workbench-panel')).toBeDefined()
      expect(screen.queryByTestId('eule-workbench-sheet')).toBeNull()
      // The chat stays on screen next to it.
      expect(screen.getByTestId('advisor-chat-input')).toBeDefined()
      fireEvent.click(screen.getByTestId('eule-workbench-close'))
      expect(screen.queryByTestId('eule-workbench-panel')).toBeNull()
      wide.unmount()

      setViewportWidth(390)
      renderScreen()
      openWorkbench()
      expect(screen.getByTestId('eule-workbench-sheet')).toBeDefined()
      expect(screen.queryByTestId('eule-workbench-panel')).toBeNull()
    })

    it('shows the legal status as one quiet line under the chat, at every width', () => {
      const tablet = renderScreen()
      expect(screen.getByTestId('eule-legal-status').textContent).toBe('Antworten nennen die Rechtsgrundlage · Rechtsstand 01.01.2025')
      expect(screen.getByTestId('eule-topbar').textContent).not.toContain('Rechtsstand')
      tablet.unmount()
      setViewportWidth(390)
      renderScreen()
      expect(screen.getByTestId('eule-legal-status')).toBeDefined()
      expect(screen.getByTestId('eule-hints-count').textContent).toBe('2')
    })

    it('says "no hints" instead of showing an empty count', () => {
      renderScreen({ initialCards: [] })
      expect(screen.getByTestId('eule-hints-pill').getAttribute('aria-label')).toContain('Keine Hinweise')
    })
  })

  it('renders proactive questions with amount, message, and safe vs risky options', () => {
    renderScreen()
    openWorkbench()
    expect(screen.getByText('Homeoffice-Tagespauschale 6 €')).toBeDefined()
    expect(screen.getByText(/\+300/)).toBeDefined()
    expect(screen.getByText('Du hast 50 Tage im Homeoffice gearbeitet.')).toBeDefined()
    expect(screen.getByText('Tagespauschale ansetzen')).toBeDefined()
    expect(screen.getByText('Häusliches Arbeitszimmer prüfen')).toBeDefined()
  })

  it('navigates to next question', () => {
    renderScreen()
    openWorkbench()
    const nextBtn = screen.getByText('Nächste Frage →')
    fireEvent.click(nextBtn)
    expect(screen.getByText('Spenden wie im Vorjahr?')).toBeDefined()
  })

  it('allows dismissing a question via Stimmt nicht (ADR-041)', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    renderScreen({ onDismissCard: onDismiss })
    openWorkbench()

    const dismissBtn = screen.getByRole('button', { name: 'Stimmt nicht' })
    fireEvent.click(dismissBtn)

    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledWith('fp-homeoffice-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('Du hast 50 Tage im Homeoffice gearbeitet.')).toBeNull()
    })
    // The count in the title bar follows.
    expect(screen.getByTestId('eule-hints-pill').getAttribute('aria-label')).toContain('1 Hinweis')
  })

  it('signs every advisor surface with the owl (AiChip "Die Eule"), never the old B dot', async () => {
    renderScreen()
    expect(screen.getByTestId('eule-topbar-title').textContent).toBe('Die Eule')
    fireEvent.click(screen.getByTestId('advisor-chips-more'))
    fireEvent.click(screen.getByText('Spenden aus dem Vorjahr prüfen'))
    expect((await screen.findByTestId('advisor-assistant-message')).textContent).toContain('Die Eule')
    expect(screen.getAllByTestId('owl-glyph').length).toBeGreaterThan(0)
    openWorkbench()
    expect(screen.getByTestId('eule-sender-card')).toBeDefined()
    expect(screen.queryByText('B')).toBeNull()
  })

  describe('Berufsprofil — "Was machst du beruflich?" in the owl\'s settings', () => {
    function openSettings() {
      fireEvent.click(screen.getByTestId('eule-settings-btn'))
    }

    it('asks for the occupation group while none is chosen, and saves the tapped one', async () => {
      const onChoose = vi.fn().mockResolvedValue(undefined)
      renderScreen({ profession: null, onChooseProfession: onChoose })
      expect(screen.queryByTestId('beruf-picker')).toBeNull()
      openSettings()
      expect(screen.getByTestId('beruf-picker')).toBeDefined()
      fireEvent.click(screen.getByText('IT & Software'))
      await waitFor(() => expect(onChoose).toHaveBeenCalledWith('IT & Software'))
    })

    it('shows the chosen group as a quiet line that can be changed', () => {
      renderScreen({ profession: 'Pflege & Gesundheit', onChooseProfession: vi.fn() })
      openSettings()
      expect(screen.queryByTestId('beruf-picker')).toBeNull()
      expect(screen.getByTestId('beruf-summary').textContent).toContain('Pflege & Gesundheit')
      fireEvent.click(screen.getByText('Ändern'))
      expect(screen.getByTestId('beruf-picker')).toBeDefined()
    })

    it('says so when the choice could not be stored, and keeps the picker open', async () => {
      const onChoose = vi.fn().mockRejectedValue(new Error('HTTP 500'))
      renderScreen({ profession: null, onChooseProfession: onChoose })
      openSettings()
      fireEvent.click(screen.getByText('IT & Software'))
      expect(await screen.findByTestId('beruf-error')).toBeDefined()
      expect(screen.getByTestId('beruf-picker')).toBeDefined()
    })

    it('shows no picker while the interview has not loaded', () => {
      renderScreen({ onChooseProfession: vi.fn() })
      openSettings()
      expect(screen.queryByTestId('beruf-picker')).toBeNull()
      expect(screen.queryByTestId('beruf-summary')).toBeNull()
    })

    it('holds the opt-in, and offers no settings where there is nothing to set', () => {
      const onToggle = vi.fn()
      const withSettings = renderScreen({ optInEnabled: true, onToggleOptIn: onToggle })
      openSettings()
      fireEvent.click(screen.getByTestId('eulen-modus-opt-in'))
      expect(onToggle).toHaveBeenCalledWith(false)
      withSettings.unmount()

      renderScreen()
      expect(screen.queryByTestId('eule-settings-btn')).toBeNull()
    })
  })

  describe('clearing the conversation (#476 decision 15)', () => {
    const MESSAGES = [
      { id: 'u1', role: 'user' as const, content: 'Frage', meta: null, createdAt: '2026-11-11T10:00:00.000Z', status: 'complete' as const },
      { id: 'a1', role: 'assistant' as const, content: 'Antwort.', meta: null, createdAt: '2026-11-11T10:00:01.000Z', status: 'complete' as const },
    ]

    it('asks before it deletes, and says what stays', async () => {
      const onClear = vi.fn().mockResolvedValue(undefined)
      renderScreen({ initialMessages: MESSAGES, onClearConversation: onClear })
      fireEvent.click(screen.getByTestId('eule-settings-btn'))
      fireEvent.click(screen.getByTestId('eule-clear-conversation-btn'))
      expect(onClear).not.toHaveBeenCalled()
      expect(screen.getByTestId('eule-clear-confirm').textContent).toContain('bleiben in deiner Erklärung')

      fireEvent.click(screen.getByTestId('eule-clear-confirm-btn'))
      await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.queryByTestId('eule-settings-sheet')).toBeNull())
    })

    it('can be called off', () => {
      const onClear = vi.fn()
      renderScreen({ initialMessages: MESSAGES, onClearConversation: onClear })
      fireEvent.click(screen.getByTestId('eule-settings-btn'))
      fireEvent.click(screen.getByTestId('eule-clear-conversation-btn'))
      fireEvent.click(screen.getByTestId('eule-clear-cancel-btn'))
      expect(screen.queryByTestId('eule-clear-confirm')).toBeNull()
      expect(onClear).not.toHaveBeenCalled()
    })

    it('says so when the conversation could not be cleared, and keeps it', async () => {
      const onClear = vi.fn().mockRejectedValue(new Error('HTTP 409'))
      renderScreen({ initialMessages: MESSAGES, onClearConversation: onClear })
      fireEvent.click(screen.getByTestId('eule-settings-btn'))
      fireEvent.click(screen.getByTestId('eule-clear-conversation-btn'))
      fireEvent.click(screen.getByTestId('eule-clear-confirm-btn'))
      expect((await screen.findByTestId('eule-clear-failed')).textContent).toContain('konnte nicht geleert werden')
      expect(screen.getByText('Antwort.')).toBeDefined()
    })

    it('has nothing to clear in an empty chat', () => {
      renderScreen({ onClearConversation: vi.fn() })
      fireEvent.click(screen.getByTestId('eule-settings-btn'))
      expect(screen.getByTestId('eule-clear-conversation-btn').getAttribute('aria-disabled')).toBe('true')
    })
  })

  describe('Kanzlei-Tisch & Steuerberater-Chat ("Deine Eule")', () => {
    it('keeps privacy one tap away in the title bar and says what the owl does and does not receive', () => {
      renderScreen()
      expect(screen.queryByTestId('eule-privacy-text')).toBeNull()
      fireEvent.click(screen.getByTestId('eule-privacy-badge'))
      const text = screen.getByTestId('eule-privacy-text').textContent ?? ''
      expect(text).toContain('keine Namen, Steuer-IDs oder IBANs')
      // Honest about what does go to the provider (ADR-0032).
      expect(text).toContain('Zahlen aus deiner Akte')
      expect(text).toContain('verschlüsselt gespeichert')
    })

    it('jumps from a proactive impulse card into the advisor chat when clicking "Mit Eule klären"', async () => {
      renderScreen()
      openWorkbench()
      const clarifyBtn = screen.getByTestId('card-clarify-with-eule')
      fireEvent.click(clarifyBtn)

      // The sheet steps aside so the answer can be read.
      await waitFor(() => expect(screen.queryByTestId('eule-workbench-sheet')).toBeNull())
      expect(await screen.findByTestId('advisor-two-paths-card')).toBeDefined()
    })

    it('conducts Mandanten-Anamnese with clickable follow-up pills and supports 1-click Apply and 1-click Undo', async () => {
      renderScreen()

      // 1. Click Quick-Starter chip for Fortbildung
      fireEvent.click(screen.getByTestId('advisor-chips-more'))
    fireEvent.click(screen.getByText('Fortbildung & Reisekosten klären'))

      // 2. Eule asks Anamnese question with clickable choice pills
      const pills = await screen.findAllByTestId('advisor-choice-pill')
      expect(pills.length).toBeGreaterThanOrEqual(3)

      // 3. Click a follow-up pill to complete Anamnese. The pill names what the training cost, so
      //    the draft carries a real amount and a real effect (#476: no flat guess any more).
      fireEvent.click(screen.getByText('Online-Kurs von zu Hause (350 €)'))

      // 4. Eule emits ActionProposalCard with exact tax delta
      expect(await screen.findByTestId('advisor-action-card', {}, { timeout: 5000 })).toBeDefined()
      expect(screen.getByTestId('advisor-action-delta').textContent).toContain('Steuer-Effekt')
      // A draft waits: the title bar counts it.
      expect(screen.getByTestId('eule-hints-pill').getAttribute('aria-label')).toContain('1 Entwurf')

      // 5. Click "✓ Jetzt übernehmen" (1-click Apply)
      fireEvent.click(screen.getByTestId('advisor-action-apply-btn'))
      expect(await screen.findByTestId('advisor-action-applied-badge', {}, { timeout: 5000 })).toBeDefined()

      // 6. Click "↩ Rückgängig machen" (1-click Undo)
      fireEvent.click(screen.getByTestId('advisor-action-undo-btn'))
      expect(await screen.findByText('✓ Erneut übernehmen', {}, { timeout: 5000 })).toBeDefined()
    })

    it('opens the interactive LawSourceModal when clicking a § LawChip', async () => {
      renderScreen()
      fireEvent.click(screen.getByTestId('advisor-chips-more'))
    fireEvent.click(screen.getByText('Spenden aus dem Vorjahr prüfen'))

      const lawChip = await screen.findByTestId('law-chip-estg-10b')
      fireEvent.click(lawChip)

      const modal = await screen.findByTestId('law-source-modal')
      expect(modal.textContent).toContain('§ 10b EStG')
      expect(modal.textContent).toContain('Rechtsstand: 01.01.2025')

      fireEvent.click(screen.getByTestId('law-source-close'))
      expect(screen.queryByTestId('law-source-modal')).toBeNull()
    })

    it('renders InMaskAdvisorCompanion trigger and expands the contextual advisor sheet', async () => {
      const i18n = createAppI18n('de')
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={qc}>
          <I18nextProvider i18n={i18n}>
            <ThemeProvider mode="light">
              <InMaskAdvisorCompanion screen="lstb" taxYear={2025} />
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>,
      )

      const trigger = screen.getByTestId('in-mask-advisor-trigger')
      fireEvent.click(trigger)

      expect(await screen.findByTestId('in-mask-advisor-sheet')).toBeDefined()
      fireEvent.click(screen.getByTestId('in-mask-advisor-close'))
      expect(screen.queryByTestId('in-mask-advisor-sheet')).toBeNull()
    })

    it('translates advisor chat and companion into English when i18n language is set to en', async () => {
      const i18n = createAppI18n('en')
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={qc}>
          <I18nextProvider i18n={i18n}>
            <ThemeProvider mode="light">
              <InMaskAdvisorCompanion screen="lstb" taxYear={2025} />
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>,
      )

      expect(screen.getByText('Ask Owl about this screen')).toBeDefined()
      expect(screen.getByText('Open advisor companion ▾')).toBeDefined()

      const trigger = screen.getByTestId('in-mask-advisor-trigger')
      fireEvent.click(trigger)

      expect(await screen.findByTestId('in-mask-advisor-sheet')).toBeDefined()
      expect(screen.getByText('Your Owl · In-screen tax advisory')).toBeDefined()
      expect(screen.getByText('Collapse ▴')).toBeDefined()
      expect(screen.getByText('Tax Assistant')).toBeDefined()
      expect(screen.getByText('The Owl')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Ask' })).toBeDefined()
      expect(screen.getByText('Check home office vs. dedicated study')).toBeDefined()
    })
  })
})
