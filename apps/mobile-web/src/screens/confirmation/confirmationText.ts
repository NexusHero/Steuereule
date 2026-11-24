// How „Prüfen & bestätigen“ words a value (MCP-5, MCP-25): the field by its name, the record it belongs to, and
// the value as its field type reads — never a raw field id, never a distance as euros.
import type { TFunction } from 'i18next'
import { QUESTIONS, fieldLabel as coreFieldLabel, fieldSpec, formatChf, formatEuro, formatEuroCents, formatNumber, parseBookingDraft, toGermanDate } from '@steuereule/core'
import type { FieldProvenanceDto } from '@steuereule/api-client'

type Tr = TFunction
type Field = Pick<FieldProvenanceDto, 'screen' | 'field'>

/** The masks whose own screens carry localized field names (`<screen>.felder.<field>`), used before the core's German names. */
const LOCALIZED_FIELD_NAMES = new Set(['lstb', 'rente', 'kapital', 'vermietung'])

/** The field's name as the user reads it. */
export function fieldLabelText(tr: Tr, w: Field): string {
  if (w.screen === 'buchung') return tr('bestaetigung.buchung.label')
  if (w.screen === 'kapital' && w.field === 'kapitalertraege') return tr('kapital.feld.label')
  if (w.screen === 'rente' && w.field === 'rentenart') return tr('bestaetigung.felder.rentenart')
  if (LOCALIZED_FIELD_NAMES.has(w.screen)) {
    const localized = tr(`${w.screen}.felder.${w.field}`, { defaultValue: '' })
    if (localized !== '') return localized
  }
  if (w.screen === 'interview') {
    const question = tr(`katalog.questions.${w.field}`, { defaultValue: '' }) || tr(`bestaetigung.fragen.${w.field}`, { defaultValue: '' })
    if (question !== '') return question
  }
  return coreFieldLabel(w.screen, w.field) ?? tr('bestaetigung.unbenanntesFeld')
}

/** Which record a value belongs to: the child, the rental object — by the name the user gave it. */
export function instanceText(tr: Tr, w: Pick<FieldProvenanceDto, 'screen' | 'instance' | 'instanceLabel'>): string | null {
  if (w.instance === null || w.screen === 'buchung') return null
  const kind = w.screen === 'kind' ? 'kind' : w.screen === 'vermietung' ? 'vermietung' : 'sonst'
  const label = w.instanceLabel?.trim()
  return label ? tr(`bestaetigung.instanz.${kind}`, { name: label }) : tr(`bestaetigung.instanz.${kind}Ohne`)
}

/** A booking draft (#549) as one line: date, text, document number and the booked sum, never its JSON. */
function bookingText(tr: Tr, value: string): string {
  const parsed = parseBookingDraft(value)
  if (!parsed.ok) return tr('bestaetigung.buchung.unlesbar')
  const { date, text, documentNumber, lines } = parsed.draft
  const sumCents = lines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + line.amount, 0)
  return tr('bestaetigung.buchung.zeile', { datum: toGermanDate(date) ?? date, text, beleg: documentNumber, summe: formatEuroCents(sumCents / 100) })
}

const WEEKDAYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const

/** An interview answer that is a sum of money, not a count or a distance. */
const isMoneyQuestion = (id: string): boolean => /(betrag|kosten|miete|brutto|erstattung|einnahmen)/.test(id)

function numberOr(value: string, format: (n: number) => string): string {
  const n = Number(value)
  return value.trim() !== '' && Number.isFinite(n) ? format(n) : value
}

/** The value as its field type reads (MCP-5): euros only for money, CHF for the Swiss certificate. */
export function valueText(tr: Tr, w: Field, value: string | null): string {
  if (value === null) return tr('bestaetigung.leererWert')
  if (w.screen === 'buchung') return bookingText(tr, value)
  if (value === 'unklar') return tr('bestaetigung.unklar')
  if (w.screen === 'rente' && w.field === 'rentenart') return tr(`rente.arten.${value}`, { defaultValue: value })
  if (w.screen === 'kapital' && w.field === 'inhaber') return tr(`kapital.inhaber.${value}`, { defaultValue: value })
  if (w.screen === 'kopplung' && w.field === 'filingType') return tr(`bestaetigung.werte.filingType.${value}`, { defaultValue: value })
  const kind = fieldSpec(w.screen, w.field)?.value.kind
  const swiss = w.screen === 'chLohnausweis' || w.field.endsWith('Chf')
  switch (kind) {
    case 'amount':
      return numberOr(value, swiss ? formatChf : formatEuro)
    case 'integer':
    case 'decimal':
      // The Bescheid and the children's sums are money in whole euros; the rest are counts, distances, shares.
      if (w.screen === 'assessment' || w.field.endsWith('Eur')) return numberOr(value, formatEuro)
      if (w.field.endsWith('Chf')) return numberOr(value, formatChf)
      // A year is a name, not a quantity: „2019“, never „2.019“.
      if (/jahr$/i.test(w.field)) return value
      return numberOr(value, formatNumber)
    case 'date':
      return toGermanDate(value) ?? value
    case 'boolean':
      return value === 'true' ? tr('bestaetigung.werte.ja') : value === 'false' ? tr('bestaetigung.werte.nein') : value
    case 'weekdays':
      return value
        .split(',')
        .map((d) => WEEKDAYS[Number(d) - 1])
        .map((d, i) => (d === undefined ? value.split(',')[i] : tr(`bestaetigung.werte.wochentage.${d}`)))
        .join(', ')
    case 'interview': {
      const form = (QUESTIONS as Readonly<Record<string, { readonly form?: { readonly kind: string } }>>)[w.field]?.form
      if (form?.kind === 'integer' || form?.kind === 'amount') return numberOr(value, isMoneyQuestion(w.field) ? formatEuro : formatNumber)
      return value
    }
    default:
      return value
  }
}
