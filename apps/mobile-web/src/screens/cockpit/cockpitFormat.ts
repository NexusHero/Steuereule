import type { TFunction } from 'i18next'
import { formatEuro, formatEuroRange } from '@steuereule/core'
import type { CockpitStatusDto, TaxEstimateDto } from '@steuereule/api-client'
import type { APP_NS } from '../../i18n/resources'
import { missingItems, type MissingItem } from './estimateMissing'
import type { Effect } from './effectMemory'

export function effectText(effect: Effect, tr: TFunction<typeof APP_NS>): string {
  const amount = formatEuro(Math.abs(effect.deltaEur))
  const direction = tr(effect.deltaEur > 0 ? 'cockpit.wirkung.mehr' : 'cockpit.wirkung.weniger', { betrag: amount })
  if (effect.area === null) return tr('cockpit.wirkung.ohneBereich', { wirkung: direction })
  return tr('cockpit.wirkung.mitBereich', {
    bereich: tr(`cockpit.kachel.${effect.area}.titel`),
    formular: tr(`cockpit.kachel.${effect.area}.formular`),
    wirkung: direction,
  })
}

/** What an open estimate lacks; nothing while the couple's filing type is the open point (it has its own sentence). */
export function estimateMissingItems(estimate: TaxEstimateDto | null): readonly MissingItem[] {
  if (estimate?.kind !== 'offen' || estimate.missing === undefined || estimate.missing.includes('veranlagungsart')) return []
  return missingItems(estimate.missing)
}

/** „Pensionskasse: Arbeitnehmerbeitrag · Schweizer Lohnausweis“, for Person B with the name in front. */
export function missingItemText(item: MissingItem, tr: TFunction<typeof APP_NS>, partnerName: string): string {
  const was = tr(item.known ? `cockpit.erstattung.fehlt.${item.id}` : 'cockpit.erstattung.fehlt.sonstiges')
  const wo = item.target === null ? null : tr(item.target.kind === 'tile' ? `cockpit.kachel.${item.target.tile}.titel` : `cockpit.kachel.partner-${item.target.area}.titel`)
  if (item.person === 'B') return wo === null ? tr('cockpit.erstattung.fehlt.partnerOhneOrt', { name: partnerName, was }) : tr('cockpit.erstattung.fehlt.partner', { name: partnerName, was, wo })
  return wo === null ? tr('cockpit.erstattung.fehlt.ohneOrt', { was }) : tr('cockpit.erstattung.fehlt.eigene', { was, wo })
}

export function refundText(estimate: TaxEstimateDto | null, tr: TFunction<typeof APP_NS>, language: string): string {
  if (estimate === null) return tr('cockpit.hero.refundLater')
  if (estimate.kind === 'offen') {
    // A married person is never estimated as single (ADR-0054): say what unlocks the couple's estimate.
    if (estimate.missing?.includes('veranlagungsart')) return tr('cockpit.erstattung.veranlagungsartOffen')
    return tr('cockpit.erstattung.offen', { count: estimate.missing?.length ?? 0 })
  }
  if (estimate.kind === 'nicht-moeglich') return tr(`cockpit.erstattung.grund.${estimate.reason ?? 'unbekannt'}`)
  const { from, to } = estimate.result ?? { from: 0, to: 0 }
  const amount = (value: number) => Math.abs(value).toLocaleString(language === 'en' ? 'en-GB' : 'de-DE')
  // A range without width ("31.192 – 31.192 €") reads like a typo; it is one figure.
  if (from === to) return tr(from >= 0 ? 'cockpit.erstattung.erstattungRund' : 'cockpit.erstattung.nachzahlungRund', { betrag: amount(from) })
  if (from >= 0) return tr('cockpit.erstattung.erstattung', { von: amount(from), bis: amount(to) })
  if (to <= 0) return tr('cockpit.erstattung.nachzahlung', { von: amount(to), bis: amount(from) })
  return tr('cockpit.erstattung.offenesErgebnis', { nachzahlung: amount(from), erstattung: amount(to) })
}

/**
 * A range that starts at 0 € only says "nothing reliable is entered yet" — "0–120 €" would read as a
 * real figure, so the hero says the income is still open instead.
 */
export function heroDisplay(status: CockpitStatusDto, stillOpen: string): string {
  if (status.kind === 'bestimmt') return formatEuro(status.value ?? 0)
  if ((status.from ?? 0) === 0) return stillOpen
  return formatEuroRange(status.from ?? 0, status.to ?? 0)
}
