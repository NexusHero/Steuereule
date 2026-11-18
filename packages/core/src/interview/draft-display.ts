// How a draft card names its effect and shows its values (ADR-0097, „Darstellung aus einem Modul“):
// the chat card and the owl workspace read the same rules, so a wage is never called a work expense
// and an amount never appears without its currency.
import { formatChf, formatEur } from '../common/format'
import type { AdvisorActionProposal } from './advisor'
import { fieldSpec } from './field-catalog'

/**
 * Masks whose drafts are Werbungskosten (§ 9 EStG) or the Homeoffice-Pauschale, the only expenses the
 * Arbeitnehmer-Pauschbetrag (§ 9a Satz 1 Nr. 1 a EStG) can swallow. A wage, a pension or any other
 * income line never sits „im Pauschbetrag“, whatever source the draft cites.
 */
const WORK_EXPENSE_SCREENS: ReadonlySet<string> = new Set(['commute', 'interview'])

/** Whether a draft that changes nothing does so because it stays below the Arbeitnehmer-Pauschbetrag. */
export function isWithinEmployeeAllowance(draft: Pick<AdvisorActionProposal, 'deltaEur' | 'sourceId' | 'screen'> & { readonly effect?: AdvisorActionProposal['effect'] }): boolean {
  if (draft.effect === 'not-computable' || draft.deltaEur !== 0) return false
  if (!WORK_EXPENSE_SCREENS.has(draft.screen)) return false
  return draft.sourceId.startsWith('estg-9') || draft.sourceId === 'estg-4-5-6c'
}

/** Interview answers are whole numbers; only those that ask for money name it in their id. */
const INTERVIEW_AMOUNT = /-(kosten|betrag|miete)$/
const NUMBER_WITH_UNIT = /^(-?\d+(?:\.\d+)?)(?:\s*(€|EUR|CHF))?$/

type Currency = 'EUR' | 'CHF'

function currencyOf(screen: string, field: string): Currency | null {
  if (screen === 'interview') return INTERVIEW_AMOUNT.test(field) ? 'EUR' : null
  const value = fieldSpec(screen, field)?.value
  if (value === undefined) return null
  const isAmount = value.kind === 'amount' || (value.kind === 'decimal' && screen === 'lstb')
  if (!isAmount) return null
  // The Swiss salary statement is in francs; a field named in euros there is the exception.
  return screen === 'chLohnausweis' && !field.endsWith('Eur') ? 'CHF' : 'EUR'
}

/** A draft's stored value as the card shows it: amounts with thousands separators and currency, everything else unchanged. */
export function formatDraftValue(screen: string, field: string, value: string): string {
  const currency = currencyOf(screen, field)
  if (currency === null) return value
  const match = NUMBER_WITH_UNIT.exec(value.trim())
  if (!match) return value
  const amount = Number(match[1])
  return currency === 'CHF' ? formatChf(amount) : formatEur(amount)
}
