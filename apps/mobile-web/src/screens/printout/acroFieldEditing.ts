/**
 * Which official AcroForm fields the expert mode may write back to the return, and how.
 *
 * `maskTargetForAcroField` (formLineMapping.ts) is a *navigation* mapping with generous fallbacks —
 * fine for jumping to a mask, wrong for writing: an unknown `anlR.*` field would land in
 * `jahresbetrag`. Writing therefore goes through this explicit allow-list only. A field that is
 * not listed here is never editable in the form, only clickable.
 */

export type AcroEditEndpoint = 'lstb' | 'ch' | 'kapital' | 'rente'

export interface DirectAcroEdit {
  readonly kind: 'direct'
  readonly endpoint: AcroEditEndpoint
  readonly field: string
  readonly person: 'A' | 'B'
  readonly unit: 'EUR' | 'CHF'
}

/** A field the form computes from other inputs (sums, allowances, conversions): read-only. */
export interface DerivedAcroField {
  readonly kind: 'derived'
  /** Plain-language names of the inputs it is computed from (UI copy, German). */
  readonly sources: readonly string[]
}

export type AcroEditSpec = DirectAcroEdit | DerivedAcroField

const DIRECT: Readonly<Record<string, DirectAcroEdit>> = {
  'anlN.kz110': { kind: 'direct', endpoint: 'lstb', field: 'bruttoarbeitslohn', person: 'A', unit: 'EUR' },
  'anlN.kz140': { kind: 'direct', endpoint: 'lstb', field: 'lohnsteuer', person: 'A', unit: 'EUR' },
  'anlNGre.z6Chf': { kind: 'direct', endpoint: 'ch', field: 'grossWageChf', person: 'A', unit: 'CHF' },
  'anlNGre.kz169': { kind: 'direct', endpoint: 'ch', field: 'withholdingTaxChf', person: 'A', unit: 'CHF' },
  'anlNGre.z82Chf': { kind: 'direct', endpoint: 'ch', field: 'ahvContributionsChf', person: 'A', unit: 'CHF' },
  'anlKap.kz210': { kind: 'direct', endpoint: 'kapital', field: 'kapitalertraege', person: 'A', unit: 'EUR' },
  'anlR.kz101': { kind: 'direct', endpoint: 'rente', field: 'jahresbetrag', person: 'A', unit: 'EUR' },
}

const derived = (...sources: string[]): DerivedAcroField => ({ kind: 'derived', sources })

/** Fields printout-values.ts computes; editing them would be silently overwritten on the next render. */
const DERIVED: Readonly<Record<string, DerivedAcroField>> = {
  'anlN.kz110Tage': derived('Arbeitstage', 'Urlaubs- und Homeoffice-Tage'),
  'anlN.kz320': derived('Arbeitsmittel (Einzelposten)'),
  'anlN.kz380': derived('Weitere Werbungskosten (Einzelposten)', 'Fortbildung', 'Umzug'),
  'anlNGre.kz380': derived('Weitere Werbungskosten (Einzelposten)'),
  'anlKap.kz217': derived('Sparer-Pauschbetrag', 'Freistellungsaufträge'),
  'anlKap.kz218': derived('Sparer-Pauschbetrag', 'Freistellungsaufträge'),
  'anlV.z32Einnahmen': derived('Kaltmiete', 'Umlagen'),
  'anlV.kz30': derived('Anschaffungskosten', 'Baujahr (AfA-Satz)'),
  'anlV.z33Afa': derived('Anschaffungskosten', 'Baujahr (AfA-Satz)'),
  'anlV.werbungskostenSumme': derived('Schuldzinsen', 'AfA', 'Laufende Werbungskosten'),
  'anlV.ueberschuss': derived('Mieteinnahmen', 'Werbungskosten'),
  'anlV.kz20': derived('Überschuss', 'Miteigentumsanteil'),
  'anlV.kz21': derived('Überschuss', 'Miteigentumsanteil'),
  'anlKind.kindergeld': derived('Kindergeld-Anspruch', 'Schweizer Familienzulage (Differenz)'),
  'anlKind.kz89': derived('Kranken- und Pflegeversicherung des Kindes (Ausland)'),
}

export function acroEditSpec(acroFieldId: string): AcroEditSpec | null {
  const id = acroFieldId.split('#')[0] ?? acroFieldId
  if (id in DIRECT) return DIRECT[id] ?? null
  if (id in DERIVED) return DERIVED[id] ?? null
  // Vorsorge sums and converted EUR rows of the N-Gre are always computed.
  if (id.startsWith('anlVor.')) return derived('Sozialversicherung laut Lohnsteuerbescheinigung', 'Weitere Vorsorgeaufwendungen')
  if (/^anlNGre\.z\d+Eur$/.test(id)) return derived('CHF-Betrag', 'Jahresdurchschnittskurs')
  return null
}

export type ParsedAmount =
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }

/**
 * Whole amounts as the masks take them: `68500`, `68.500` or `68.500,00`. Anything ambiguous
 * (`1.5`, `68,5`, cents, negatives) is rejected rather than guessed — a tax value must not change
 * by an order of magnitude because of a separator.
 */
export function parseWholeAmount(raw: string): ParsedAmount {
  const text = raw.trim()
  if (text === '') return { kind: 'empty' }
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,00?)?$/.exec(text)
  if (!match?.[1]) return { kind: 'invalid' }
  const value = Number(match[1].replace(/\./g, ''))
  return Number.isSafeInteger(value) ? { kind: 'value', value } : { kind: 'invalid' }
}

/** What happened to a save from the form; the viewer turns it into honest feedback. */
export type AcroSaveOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'not-editable' }
