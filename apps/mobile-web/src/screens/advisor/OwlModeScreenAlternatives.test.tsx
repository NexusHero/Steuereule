import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { OwlModeScreen } from './OwlModeScreen'

const draft = (actionId: string, field: string, newValue: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => ({
  actionId,
  status: 'pending',
  screen: 'interview',
  field,
  instance: null,
  label: `Entwurf ${actionId}`,
  previousValue: null,
  newValue,
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: '',
  sourceId: 'estg-10b',
  ...extra,
})

const assistant = (id: string, meta: AdvisorChatMessageView['meta']): AdvisorChatMessageView => ({
  id,
  role: 'assistant',
  content: 'Antwort.',
  meta,
  createdAt: '2026-11-14T10:00:00.000Z',
  status: 'complete',
})

// A comparison stored without groups: its two paths still exclude each other.
const TWO_PATHS = assistant('a1', {
  twoPaths: {
    title: 'Zwei Wege',
    sourceId: 'estg-4-5-6c',
    safePath: draft('p-safe', 'homeoffice', '1–2 Tage pro Woche'),
    maxPath: { ...draft('p-max', 'homeoffice', 'Fast immer'), evidenceHint: 'Nachweis' },
  },
})

function renderScreen(messages: readonly AdvisorChatMessageView[], onApplyAction = vi.fn()) {
  const i18n = createAppI18n('de')
  render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <OwlModeScreen taxYear={2026} initialCards={[]} initialMessages={messages} onApplyAction={onApplyAction} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  fireEvent.click(screen.getByTestId('eule-hints-pill'))
  return onApplyAction
}

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => setViewportWidth(1024))
afterEach(() => setViewportWidth(0))

describe('the workbench never applies alternatives together (K1)', () => {
  it('disables the batch button and says to pick one of the paths', () => {
    renderScreen([TWO_PATHS])
    const batch = screen.getByTestId('eule-batch-apply-btn')
    expect(batch.getAttribute('aria-disabled') === 'true' || batch.hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('eule-batch-alternatives-hint').textContent).toBe('Wähle einen der Wege — beide zusammen geht nicht.')
  })

  it('applies only the path the user picks', async () => {
    const onApply = renderScreen([TWO_PATHS])
    fireEvent.click(screen.getByTestId('eule-batch-apply-btn'))
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('draft-choose-p-safe'))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('p-safe'))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('treats two drafts on the same field from different answers as alternatives too', () => {
    renderScreen([
      assistant('a1', { action: draft('d1', 'spenden-betrag', '100') }),
      assistant('a2', { action: draft('d2', 'spenden-betrag', '300') }),
    ])
    expect(screen.getByTestId('eule-batch-alternatives-hint')).toBeDefined()
  })

  it('keeps the batch button for drafts that go together, and shows an open effect as open', () => {
    renderScreen([
      assistant('a1', {
        actions: [draft('d1', 'spenden-betrag', '100'), draft('d2', 'homeOfficeDays', '80', { screen: 'commute', sourceId: 'estg-4-5-6c', effect: 'not-computable' })],
      }),
    ])
    expect(screen.queryByTestId('eule-batch-alternatives-hint')).toBeNull()
    expect(screen.queryByTestId('draft-choose-d1')).toBeNull()
    expect(screen.getByTestId('draft-effect-open-d2').textContent).toBe('Wirkung noch offen')
    const batch = screen.getByTestId('eule-batch-apply-btn')
    expect(batch.getAttribute('aria-disabled') === 'true' || batch.hasAttribute('disabled')).toBe(false)
  })
})
