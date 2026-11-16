/**
 * Which official AcroForm fields the expert mode may write back to the return, and how.
 *
 * `maskTargetForAcroField` (formLineMapping.ts) is a *navigation* mapping with generous fallbacks —
 * fine for jumping to a mask, wrong for writing: an unknown `anlR.*` field would land in
 * `jahresbetrag`. Writing therefore goes through this explicit allow-list only. A field that is
 * not listed here is never editable in the form, only clickable. The lists follow what
 * apps/api/src/printout/printout-values.ts prints into each field.
 */

import { isValidPostalCode, isValidTaxId } from '@steuereule/core'

export type AcroEditEndpoint = 'lstb' | 'ch' | 'kapital' | 'rente'

/** The printed copy a field sits on, as `GET ausdruck/werte` returns it. */
export interface AcroInstanceContext {
  readonly person: 'A' | 'B' | null
  readonly entityId: string | null
  /** How many copies of this Vordruck are printed (2 = e.g. a joint account split A/B). */
  readonly copies: number
}

export const SINGLE_COPY: AcroInstanceContext = { person: null, entityId: null, copies: 1 }

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

/** A text field of the master data, of Person B, or of the child / rental object of its copy. */
export interface TextAcroEdit {
  readonly kind: 'text'
  readonly target: 'stammdaten' | 'personB' | 'child' | 'rental'
  readonly field: string
  readonly person: 'A' | 'B'
  /** The child or rental object of the copy; null for master data and Person B. */
  readonly entityId: string | null
  readonly rule: 'text' | 'postalCode' | 'taxId'
  /** The endpoint takes no null here: clearing would be refused, so it is refused up front. */
  readonly required: boolean
}

export type EditableAcroField = DirectAcroEdit | TextAcroEdit
export type AcroEditSpec = EditableAcroField | DerivedAcroField

type DirectField = Pick<DirectAcroEdit, 'endpoint' | 'field' | 'unit'>

/** Printed exactly as entered (printout-values.ts); the person comes from the copy. */
const DIRECT: Readonly<Record<string, DirectField>> = {
  'anlN.kz110': { endpoint: 'lstb', field: 'bruttoarbeitslohn', unit: 'EUR' },
  'anlNGre.z6Chf': { endpoint: 'ch', field: 'grossWageChf', unit: 'CHF' },
  'anlNGre.z8Chf': { endpoint: 'ch', field: 'familienzulagenChf', unit: 'CHF' },
  'anlKap.kz210': { endpoint: 'kapital', field: 'kapitalertraege', unit: 'EUR' },
  'anlKap.kz234': { endpoint: 'kapital', field: 'kapitalertraege', unit: 'EUR' },
  // PENSION_CODE: statutory and survivors' pensions print in Kz 101, private ones in Kz 131.
  'anlR.kz101': { endpoint: 'rente', field: 'jahresbetrag', unit: 'EUR' },
  'anlR.kz131': { endpoint: 'rente', field: 'jahresbetrag', unit: 'EUR' },
}

type TextField = Pick<TextAcroEdit, 'target' | 'field' | 'rule' | 'required'>
const text = (target: TextAcroEdit['target'], field: string, options: Partial<Pick<TextAcroEdit, 'rule' | 'required'>> = {}): TextField => ({
  target,
  field,
  rule: options.rule ?? 'text',
  required: options.required ?? false,
})

/**
 * Religion (Art. 9 DSGVO, needs consent), IBAN (normalised and checked) and marital status /
 * filing type (choices that change other annexes) deliberately stay in their masks.
 */
const TEXT: Readonly<Record<string, TextField>> = {
  'est1a.strasse': text('stammdaten', 'strasse'),
  'est1a.hausnummer': text('stammdaten', 'hausnummer'),
  'est1a.hausnummerZusatz': text('stammdaten', 'hausnummerZusatz'),
  'est1a.plz': text('stammdaten', 'plz', { rule: 'postalCode' }),
  'est1a.wohnort': text('stammdaten', 'wohnort'),
  'est1a.beruf': text('stammdaten', 'beruf'),
  'est1a.finanzamt': text('stammdaten', 'finanzamt'),
  'est1a.vornameB': text('personB', 'firstName'),
  'est1a.nameB': text('personB', 'lastName'),
  'est1a.idnrB': text('personB', 'steuerId', { rule: 'taxId' }),
  'est1a.berufB': text('personB', 'beruf'),
  'anlKind.vorname': text('child', 'firstName', { required: true }),
  'anlKind.nachname': text('child', 'lastName', { required: true }),
  'anlKind.idnr': text('child', 'taxId', { rule: 'taxId', required: true }),
  'anlV.plz': text('rental', 'plz', { rule: 'postalCode', required: true }),
  'anlV.ort': text('rental', 'city', { required: true }),
}

const derived = (...sources: string[]): DerivedAcroField => ({ kind: 'derived', sources })

/** Fields printout-values.ts computes; editing them would be silently overwritten on the next render. */
const DERIVED: Readonly<Record<string, DerivedAcroField>> = {
  'anlN.kz320': derived('Arbeitsmittel (Einzelposten)'),
  'anlN.kz380': derived('Weitere Werbungskosten (Einzelposten)', 'Fortbildung', 'Umzug'),
  'anlNGre.kz380': derived('Weitere Werbungskosten (Einzelposten)'),
  'anlNGre.z15Chf': derived('Bruttolohn', 'Familienzulagen', 'Krankentaggeld'),
  'anlNGre.z23Chf': derived('Bruttolohn', 'Familienzulagen', 'Krankentaggeld', 'Arbeitgeberanteile'),
  'anlNGre.z25Chf': derived('Quellensteuer (höchstens 4,5 % des Bruttolohns)'),
  'anlNGre.z75Chf': derived('Bruttolohn'),
  'anlNGre.z76Chf': derived('Familienzulagen', 'Krankentaggeld'),
  'anlNGre.z77Chf': derived('Bruttolohn', 'Familienzulagen', 'Krankentaggeld'),
  'anlNGre.z82Chf': derived('EO', 'ALV', 'Krankentaggeld', 'NBUV'),
  'anlKap.kz217': derived('Sparer-Pauschbetrag', 'Freistellungsaufträge'),
  'anlKap.kz218': derived('Sparer-Pauschbetrag', 'Freistellungsaufträge'),
  'anlV.strasse': derived('Straße', 'Hausnummer'),
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

export function acroEditSpec(acroFieldId: string, context: AcroInstanceContext = SINGLE_COPY): AcroEditSpec | null {
  const id = acroFieldId.split('#')[0] ?? acroFieldId
  const person = context.person ?? 'A'
  const direct = DIRECT[id]
  if (direct) {
    // A joint account is printed half on each spouse's Anlage KAP: neither copy is the stored amount.
    if (direct.endpoint === 'kapital' && context.copies > 1) return derived('Kapitalerträge', 'Aufteilung zwischen den Ehegatten')
    return { kind: 'direct', ...direct, person }
  }
  const textField = TEXT[id]
  if (textField) {
    const perRecord = textField.target === 'child' || textField.target === 'rental'
    if (perRecord && context.entityId === null) return null
    return {
      kind: 'text',
      ...textField,
      person: textField.target === 'personB' ? 'B' : person,
      entityId: perRecord ? context.entityId : null,
    }
  }
  if (id in DERIVED) return DERIVED[id] ?? null
  // Vorsorge sums and converted EUR rows of the N-Gre are always computed.
  if (id.startsWith('anlVor.')) return derived('Sozialversicherung laut Lohnsteuerbescheinigung', 'Weitere Vorsorgeaufwendungen')
  if (/^anlNGre\.z\d+Eur$/.test(id)) return derived('CHF-Betrag', 'Jahresdurchschnittskurs')
  return null
}

export type InvalidReason = 'amount' | 'text' | 'postalCode' | 'taxId' | 'required'

export type ParsedInput<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly reason: InvalidReason }

const MAX_TEXT_LENGTH = 100
// oxlint-disable-next-line no-control-regex -- control characters are exactly what is rejected
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/** Parses what the user typed into an editable form field with that field's rule. */
export function parseAcroInput(spec: EditableAcroField, raw: string): ParsedInput<number | string> {
  if (spec.kind === 'direct') {
    const amount = parseWholeAmount(raw)
    return amount.kind === 'invalid' ? { kind: 'invalid', reason: 'amount' } : amount
  }
  const value = spec.rule === 'taxId' ? raw.replace(/\s+/g, '') : raw.trim()
  if (value === '') return spec.required ? { kind: 'invalid', reason: 'required' } : { kind: 'empty' }
  if (spec.rule === 'postalCode' && !isValidPostalCode(value)) return { kind: 'invalid', reason: 'postalCode' }
  if (spec.rule === 'taxId' && !isValidTaxId(value)) return { kind: 'invalid', reason: 'taxId' }
  if (value.length > MAX_TEXT_LENGTH || CONTROL_CHARACTERS.test(value)) return { kind: 'invalid', reason: 'text' }
  return { kind: 'value', value }
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
  const input = raw.trim()
  if (input === '') return { kind: 'empty' }
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,00?)?$/.exec(input)
  if (!match?.[1]) return { kind: 'invalid' }
  const value = Number(match[1].replace(/\./g, ''))
  return Number.isSafeInteger(value) ? { kind: 'value', value } : { kind: 'invalid' }
}

/** What happened to a save from the form; the viewer turns it into honest feedback. */
export type AcroSaveOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'invalid'; readonly reason: InvalidReason }
  | { readonly kind: 'failed' }
  | { readonly kind: 'not-editable' }
