import type { AdvisorActionProposal, AdvisorChatMessageView, CaseDigest, OwlCardsDisplay } from '@steuereule/core'
import { formatDraftValue, withoutAlternativesOf } from '@steuereule/core'
import { runningTaxYear } from '../../config/taxYear'
import { OWL_CHAT_MIN_WIDTH, OWL_PANEL_WIDTHS } from '../../lib/owlSidebarPreference'

export const DEFAULT_LOCAL_DIGEST: CaseDigest = {
  taxYear: runningTaxYear(),
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: 62000, wageTaxEur: 11800, socialSecurityEur: 11400 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 18,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: ['stammdaten.iban'],
  estimatedRefundEur: 480,
}

/** The core keeps the legal status as DD.MM.YYYY; English readers get it unambiguous. */
export function formatLegalDate(germanDate: string, language: string): string {
  if (language.startsWith('de')) return germanDate
  const [day, month, year] = germanDate.split('.')
  return day && month && year ? `${year}-${month}-${day}` : germanDate
}

/** The local preview's case: the default digest for the year, with the open hint cards. */
export function localDigest(taxYear: number, cards: readonly OwlCardsDisplay[]): CaseDigest {
  return {
    ...DEFAULT_LOCAL_DIGEST,
    taxYear,
    openOwlHints: cards.map((c) => ({
      id: c.id,
      fingerprint: c.fingerprint,
      title: c.title,
      message: c.message,
      sourceId: 'estg-9-1',
      amountEur: c.amountEur,
    })),
  }
}

/** Regenerate / edit locally: the replaced turn and everything after it leave the chat. */
export function messagesBefore(messages: readonly AdvisorChatMessageView[], messageId: string): readonly AdvisorChatMessageView[] {
  const at = messages.findIndex((m) => m.id === messageId)
  return at === -1 ? messages : messages.slice(0, at)
}

/** Applying one alternative drops the others; the server marks them superseded the same way. */
export function supersededBy(pendingDrafts: readonly AdvisorActionProposal[], actionId: string): AdvisorActionProposal[] {
  const chosen = pendingDrafts.find((d) => d.actionId === actionId)
  const kept = new Set(chosen ? withoutAlternativesOf(pendingDrafts, chosen).map((d) => d.actionId) : [])
  return chosen ? pendingDrafts.filter((d) => d.actionId !== actionId && !kept.has(d.actionId)) : []
}

/** „vorher → nachher“ of a draft, in the mask's own formatting. */
export function draftDiffText(draft: AdvisorActionProposal, notRecorded: string): string {
  return `${draft.previousValue === null ? notRecorded : formatDraftValue(draft.screen, draft.field, draft.previousValue)} → ${formatDraftValue(draft.screen, draft.field, draft.newValue)}`
}

/** The user's situation with an accepted suggestion as a new line. */
export function situationWith(situation: string | undefined, text: string): string {
  return [situation?.trim() ?? '', text].filter((part) => part !== '').join('\n')
}

/** Only something new to check (another mask, one more draft) overrides the reader's own choice. */
export function attentionGrew(seen: { readonly mask: string | null; readonly drafts: number }, openMask: string | null, draftCount: number, wide: boolean): boolean {
  return (openMask !== null && openMask !== seen.mask) || (wide && draftCount > seen.drafts)
}

/** What the side panels may take: the chat keeps its minimum, whatever was dragged or remembered. */
export function owlPanelWidths(input: {
  readonly windowWidth: number
  readonly sidebarWidth: number
  readonly workbenchWidth: number
  readonly showSidebar: boolean
  readonly showWorkbench: boolean
}): { readonly sidebarMax: number; readonly sidebarShown: number; readonly workbenchMax: number; readonly workbenchShown: number } {
  const { windowWidth, sidebarWidth, workbenchWidth, showSidebar, showWorkbench } = input
  const sidebarMax = Math.min(OWL_PANEL_WIDTHS.sidebar.max, windowWidth - OWL_CHAT_MIN_WIDTH - (showWorkbench ? workbenchWidth : 0))
  const sidebarShown = Math.max(OWL_PANEL_WIDTHS.sidebar.min, Math.min(sidebarWidth, sidebarMax))
  const workbenchMax = Math.min(OWL_PANEL_WIDTHS.workbench.max, windowWidth - OWL_CHAT_MIN_WIDTH - (showSidebar ? sidebarShown : 0))
  const workbenchShown = Math.max(OWL_PANEL_WIDTHS.workbench.min, Math.min(workbenchWidth, workbenchMax))
  return { sidebarMax, sidebarShown, workbenchMax, workbenchShown }
}

/** The session summary sheet's sentence: what was applied, and what is still open. */
export function sessionSummaryText(applied: readonly AdvisorActionProposal[], pending: readonly AdvisorActionProposal[], cardCount: number): string {
  return applied.length > 0 || pending.length > 0 || cardCount > 0
    ? `In dieser Session erledigt: ${applied.length} ${applied.length === 1 ? 'Änderung übernommen' : 'Änderungen übernommen'}${
        applied.length > 0 ? ` (${applied.map((d) => `${d.label}: ${d.newValue}`).join(', ')})` : ''
      }. Offene Punkte: ${pending.length} ${pending.length === 1 ? 'Entwurf' : 'Entwürfe'} und ${cardCount} ${cardCount === 1 ? 'Hinweis' : 'Hinweise'}.`
    : 'In dieser Session wurden noch keine Änderungen übernommen. Stelle der Eule eine Frage oder lade einen Beleg hoch.'
}
