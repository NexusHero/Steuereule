import type { IncomeType } from './einkunftsarten'
import { calculate, type CalculationStatus, type Item } from './berechnung'
import { chfToEur, type ExchangeRate } from './wechselkurs'
import { CH_RESIDENCE_VALUES, type ChResidence } from './interview'

export { CH_RESIDENCE_VALUES as CH_WOHNSITZ_VALUES }
export type { ChResidence as ChWohnsitz }

export const CROSS_BORDER_NON_RETURN_DAYS = 60

export type CrossBorderStatus = 'echter-grenzgaenger' | 'kein-grenzgaenger'

export function crossBorderStatus(residence: ChResidence, nonReturnDays: number): CrossBorderStatus {
  if (!Number.isInteger(nonReturnDays) || nonReturnDays < 0) {
    throw new RangeError('nichtrueckkehrtage must be a non-negative integer')
  }
  if (residence === 'Schweiz') return 'kein-grenzgaenger'
  return nonReturnDays > CROSS_BORDER_NON_RETURN_DAYS ? 'kein-grenzgaenger' : 'echter-grenzgaenger'
}

export type SalaryCertificateFieldId =
  | 'lohn'
  | 'gehaltsnebenleistungen'
  | 'unregelmaessige-leistungen'
  | 'kapitalleistungen'
  | 'beteiligungsrechte'
  | 'sitzungsgelder'
  | 'andere-leistungen'
  | 'bruttolohn-total'
  | 'ahv-beitraege'
  | 'berufliche-vorsorge'
  | 'nettolohn'
  | 'quellensteuer'
  | 'spesen'
  | 'weitere-nebenleistungen'
  | 'bemerkungen'

export interface SalaryCertificateField {
  readonly digit: string
  readonly id: SalaryCertificateFieldId
  readonly kind: 'chf-betrag' | 'freitext'
  readonly itemsRelevant: boolean
}

export const SALARY_CERTIFICATE_FIELDS: readonly SalaryCertificateField[] = [
  { digit: '1', id: 'lohn', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '2', id: 'gehaltsnebenleistungen', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '3', id: 'unregelmaessige-leistungen', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '4', id: 'kapitalleistungen', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '5', id: 'beteiligungsrechte', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '6', id: 'sitzungsgelder', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '7', id: 'andere-leistungen', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '8', id: 'bruttolohn-total', kind: 'chf-betrag', itemsRelevant: true },
  { digit: '9', id: 'ahv-beitraege', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '10', id: 'berufliche-vorsorge', kind: 'chf-betrag', itemsRelevant: true },
  { digit: '11', id: 'nettolohn', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '12', id: 'quellensteuer', kind: 'chf-betrag', itemsRelevant: true },
  { digit: '13', id: 'spesen', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '14', id: 'weitere-nebenleistungen', kind: 'chf-betrag', itemsRelevant: false },
  { digit: '15', id: 'bemerkungen', kind: 'freitext', itemsRelevant: false },
]

export type SalaryCertificateValues = Partial<Record<SalaryCertificateFieldId, number>>

export type SalaryCertificateAmountFieldId = Exclude<SalaryCertificateFieldId, 'bemerkungen'>

export const SALARY_CERTIFICATE_AMOUNT_FIELDS: readonly SalaryCertificateAmountFieldId[] = SALARY_CERTIFICATE_FIELDS.filter(
  (field) => field.kind === 'chf-betrag',
).map((field) => field.id) as readonly SalaryCertificateAmountFieldId[]

export function openSalaryCertificateFields(values: SalaryCertificateValues, status: CrossBorderStatus): readonly SalaryCertificateFieldId[] {
  const required = new Set<SalaryCertificateFieldId>(['bruttolohn-total', 'berufliche-vorsorge'])
  if (status === 'echter-grenzgaenger') required.add('quellensteuer')
  return SALARY_CERTIFICATE_FIELDS.filter((field) => required.has(field.id) && values[field.id] === undefined).map((field) => field.id)
}

export type ChItemKind =
  | 'Bruttolohn'
  | 'Quellensteuer'
  | 'Pensionskasse'
  | 'AHV'
  | 'Saeule3a'
  | 'Krankenkasse'
  | 'Familienzulage'

/** A CH line item with full provenance: Lohnausweis-Ziffer times exchange rate. */
export interface ChItem {
  readonly id: string
  readonly kind: ChItemKind
  readonly digit?: string
  readonly amountChf: number
  readonly exchangeRate: ExchangeRate
  readonly amountEur: number
}

function fieldToItemKind(field: SalaryCertificateFieldId): ChItemKind {
  switch (field) {
    case 'bruttolohn-total':
      return 'Bruttolohn'
    case 'quellensteuer':
      return 'Quellensteuer'
    case 'berufliche-vorsorge':
      return 'Pensionskasse'
    case 'ahv-beitraege':
      return 'AHV'
    default:
      throw new RangeError(`Lohnausweis field "${field}" has no ChPosten mapping`)
  }
}

function makeChItem(id: string, kind: ChItemKind, amountChf: number, exchangeRate: ExchangeRate, digit?: string): ChItem {
  return { id, kind, amountChf, exchangeRate, amountEur: chfToEur(amountChf, exchangeRate.rate), ...(digit !== undefined ? { digit } : {}) }
}

export function chItemsFromSalaryCertificate(values: SalaryCertificateValues, exchangeRate: ExchangeRate): readonly ChItem[] {
  const items: ChItem[] = []
  for (const field of SALARY_CERTIFICATE_FIELDS) {
    if (!field.itemsRelevant || field.kind !== 'chf-betrag') continue
    const amountChf = values[field.id]
    if (amountChf === undefined) continue
    items.push(makeChItem(`ch-lohnausweis-${field.id}`, fieldToItemKind(field.id), amountChf, exchangeRate, field.digit))
  }
  return items
}

export function pillar3aDeduction(paidInChf: number, exchangeRate: ExchangeRate): ChItem {
  return makeChItem('ch-saeule-3a', 'Saeule3a', paidInChf, exchangeRate)
}

export function healthInsurerDeduction(contributionChf: number, exchangeRate: ExchangeRate): ChItem {
  return makeChItem('ch-krankenkasse', 'Krankenkasse', contributionChf, exchangeRate)
}

export function offsetAllowances(chAllowancesEur: number, deChildBenefitEur: number): number {
  if (!Number.isFinite(chAllowancesEur) || chAllowancesEur < 0) throw new RangeError('chZulagenEur must be a non-negative finite number')
  if (!Number.isFinite(deChildBenefitEur) || deChildBenefitEur < 0) {
    throw new RangeError('deKindergeldEur must be a non-negative finite number')
  }
  return Math.round((chAllowancesEur - deChildBenefitEur) * 100) / 100
}

export function grossWageAsCoreItem(items: ChItem): Item | null {
  if (items.kind !== 'Bruttolohn') return null
  return chItemsAsCoreItems(items)
}

export function chItemsAsCoreItems(items: ChItem): Item | null {
  let role: Item['role']
  let source: Item['source']
  switch (items.kind) {
    case 'Bruttolohn':
      role = 'einnahme'
      source = { kind: 'beleg', receiptId: 'lohnausweis' }
      break
    case 'Pensionskasse':
      role = 'vorsorgeaufwand'
      source = { kind: 'beleg', receiptId: 'lohnausweis' }
      break
    case 'Quellensteuer':
      role = 'anrechnung'
      source = { kind: 'beleg', receiptId: 'lohnausweis' }
      break
    case 'Saeule3a':
    case 'Krankenkasse':
      role = 'vorsorgeaufwand'
      source = { kind: 'eingabe' }
      break
    case 'AHV':
    case 'Familienzulage':
      return null
  }
  return {
    id: items.id,
    incomeType: 'Grenzgänger',
    role,
    amount: Math.round(items.amountEur),
    source,
  }
}

/** The CH line items to fold, plus the honest open/gated facts that may block a determined result. */
export interface CrossBorderCalculationInput {
  readonly salaryCertificate: SalaryCertificateValues
  readonly saeule3aChf?: number
  readonly krankenkasseChf?: number
  readonly status: CrossBorderStatus
  readonly exchangeRate: ExchangeRate
  readonly gated: readonly IncomeType[]
}

export function crossBorderChItems(input: {
  readonly salaryCertificate: SalaryCertificateValues
  readonly saeule3aChf?: number
  readonly krankenkasseChf?: number
  readonly exchangeRate: ExchangeRate
}): readonly ChItem[] {
  const items: ChItem[] = [...chItemsFromSalaryCertificate(input.salaryCertificate, input.exchangeRate)]
  if (input.saeule3aChf !== undefined) items.push(pillar3aDeduction(input.saeule3aChf, input.exchangeRate))
  if (input.krankenkasseChf !== undefined) items.push(healthInsurerDeduction(input.krankenkasseChf, input.exchangeRate))
  return items
}

export function crossBorderFold(input: CrossBorderCalculationInput): CalculationStatus {
  const coreItems = crossBorderChItems(input)
    .map(chItemsAsCoreItems)
    .filter((p): p is Item => p !== null)
  const openItems = openSalaryCertificateFields(input.salaryCertificate, input.status).length
  return calculate({ items: coreItems, openItems, conflicts: [], gated: input.gated })
}

export const SALARY_CERTIFICATE_UNCLEAR = 'unklar'

export function isValidSalaryCertificateAmount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function serializeSalaryCertificateField(value: number | null | typeof SALARY_CERTIFICATE_UNCLEAR): string | null {
  if (value === null) return null
  if (value === SALARY_CERTIFICATE_UNCLEAR) return SALARY_CERTIFICATE_UNCLEAR
  if (!isValidSalaryCertificateAmount(value)) {
    throw new RangeError(`lohnausweis: erfasst value must be a non-negative integer`)
  }
  return String(value)
}

export function deserializeSalaryCertificateField(value: string | null): number | null | typeof SALARY_CERTIFICATE_UNCLEAR {
  if (value === null) return null
  if (value === SALARY_CERTIFICATE_UNCLEAR) return SALARY_CERTIFICATE_UNCLEAR
  const rawValue = Number(value)
  if (!isValidSalaryCertificateAmount(rawValue)) {
    throw new Error(`lohnausweis: stored value "${value}" is neither offen, unklar, nor a valid amount`)
  }
  return rawValue
}
