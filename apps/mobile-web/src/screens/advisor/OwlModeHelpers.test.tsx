import { describe, expect, it } from 'vitest'
import { formatDraftValue, type AdvisorActionProposal, type AdvisorChatMessageView, type OwlCardsDisplay } from '@steuereule/core'
import { OWL_CHAT_MIN_WIDTH, OWL_PANEL_WIDTHS } from '../../lib/owlSidebarPreference'
import {
  DEFAULT_LOCAL_DIGEST,
  attentionGrew,
  formatLegalDate,
  localDigest,
  messagesBefore,
  draftDiffText,
  supersededBy,
  owlPanelWidths,
  sessionSummaryText,
  situationWith,
} from './OwlModeHelpers'

const draft = (actionId: string, label: string, newValue: string) => ({ actionId, label, newValue }) as unknown as AdvisorActionProposal

describe('the legal status date', () => {
  it('stays German for German readers and turns ISO for others', () => {
    expect(formatLegalDate('01.01.2025', 'de-DE')).toBe('01.01.2025')
    expect(formatLegalDate('01.01.2025', 'en')).toBe('2025-01-01')
    expect(formatLegalDate('2025', 'en')).toBe('2025')
  })
})

describe('the local preview chat', () => {
  it('builds the digest of the year from the open hint cards', () => {
    const card = { id: 'k1', fingerprint: 'f1', title: 'Laptop', message: 'Absetzbar?', amountEur: 120 } as unknown as OwlCardsDisplay
    const digest = localDigest(2024, [card])
    expect(digest.taxYear).toBe(2024)
    expect(digest.filingStatus).toBe(DEFAULT_LOCAL_DIGEST.filingStatus)
    expect(digest.openOwlHints).toEqual([{ id: 'k1', fingerprint: 'f1', title: 'Laptop', message: 'Absetzbar?', sourceId: 'estg-9-1', amountEur: 120 }])
  })

  it('drops the replaced turn and everything after it', () => {
    const list = ['u1', 'a1', 'u2', 'a2'].map((id) => ({ id }) as AdvisorChatMessageView)
    expect(messagesBefore(list, 'u2').map((m) => m.id)).toEqual(['u1', 'a1'])
    expect(messagesBefore(list, 'nope')).toBe(list)
  })
})

describe('the situation', () => {
  it('adds an accepted suggestion as a new line', () => {
    expect(situationWith(undefined, 'Wir haben ein Kind.')).toBe('Wir haben ein Kind.')
    expect(situationWith('  Verheiratet. ', 'Wir haben ein Kind.')).toBe('Verheiratet.\nWir haben ein Kind.')
  })
})

describe('when the workbench opens by itself', () => {
  it('opens for another mask, and on a wide screen for one more draft', () => {
    const seen = { mask: null, drafts: 1 }
    expect(attentionGrew(seen, 'lstb', 1, false)).toBe(true)
    expect(attentionGrew({ mask: 'lstb', drafts: 1 }, 'lstb', 1, true)).toBe(false)
    expect(attentionGrew(seen, null, 2, true)).toBe(true)
    expect(attentionGrew(seen, null, 2, false)).toBe(false)
    expect(attentionGrew(seen, null, 0, true)).toBe(false)
  })
})

describe('the widths of the side panels', () => {
  it('keeps the chat at its minimum width', () => {
    const windowWidth = OWL_CHAT_MIN_WIDTH + OWL_PANEL_WIDTHS.sidebar.min + OWL_PANEL_WIDTHS.workbench.min
    const widths = owlPanelWidths({ windowWidth, sidebarWidth: 10_000, workbenchWidth: 10_000, showSidebar: true, showWorkbench: false })
    expect(widths.sidebarShown).toBe(Math.min(OWL_PANEL_WIDTHS.sidebar.max, windowWidth - OWL_CHAT_MIN_WIDTH))
    expect(widths.workbenchShown).toBe(OWL_PANEL_WIDTHS.workbench.min)
  })

  it('never goes below a panel minimum', () => {
    const widths = owlPanelWidths({ windowWidth: 0, sidebarWidth: 0, workbenchWidth: 0, showSidebar: false, showWorkbench: false })
    expect(widths.sidebarShown).toBe(OWL_PANEL_WIDTHS.sidebar.min)
    expect(widths.workbenchShown).toBe(OWL_PANEL_WIDTHS.workbench.min)
  })
})

describe('the session summary', () => {
  it('says that nothing happened yet', () => {
    expect(sessionSummaryText([], [], 0)).toBe('In dieser Session wurden noch keine Änderungen übernommen. Stelle der Eule eine Frage oder lade einen Beleg hoch.')
  })

  it('names what was applied and counts what is open', () => {
    expect(sessionSummaryText([draft('a1', 'Fahrtkosten', '1200')], [draft('p1', 'x', '1')], 2)).toBe(
      'In dieser Session erledigt: 1 Änderung übernommen (Fahrtkosten: 1200). Offene Punkte: 1 Entwurf und 2 Hinweise.',
    )
    expect(sessionSummaryText([], [draft('p1', 'x', '1'), draft('p2', 'y', '2')], 1)).toBe(
      'In dieser Session erledigt: 0 Änderungen übernommen. Offene Punkte: 2 Entwürfe und 1 Hinweis.',
    )
  })
})

describe('a draft in the workbench', () => {
  it('shows before and after, and „not recorded“ without a value before', () => {
    const d = { screen: 'commute', field: 'distanceKm', previousValue: null, newValue: '18' } as unknown as AdvisorActionProposal
    expect(draftDiffText(d, 'Nicht erfasst')).toBe(`Nicht erfasst → ${formatDraftValue('commute' as never, 'distanceKm', '18')}`)
    const e = { ...d, previousValue: '12' } as AdvisorActionProposal
    expect(draftDiffText(e, 'Nicht erfasst')).toBe(`${formatDraftValue('commute' as never, 'distanceKm', '12')} → ${formatDraftValue('commute' as never, 'distanceKm', '18')}`)
  })

  it('supersedes nothing when the applied draft is not pending', () => {
    expect(supersededBy([draft('a1', 'x', '1')], 'other')).toEqual([])
    expect(supersededBy([draft('a1', 'x', '1')], 'a1')).toEqual([])
  })
})
