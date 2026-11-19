import type { AssessmentPositionType } from '../engine/assessment'
import type { AdvisorActionStatus } from '../interview/advisor'

/**
 * „Kommt jedes Jahr wieder“ (ADR-0099 §2): the items that came up in either of the last two years, as a
 * checklist on the page of the open year. Last year's amount is a hint only: nothing here is ever written
 * into the open year, and an item the open year lacks carries no amount of its own.
 */

export type RecurringItemId =
  | 'arbeitsweg'
  | 'homeoffice'
  | 'arbeitsmittel'
  | 'kontofuehrung'
  | 'berufsverbaende'
  | 'fortbildung'
  | 'spenden'
  | 'kirchensteuer'
  | 'kinderbetreuung'
  | 'krankenkasse-kind'
  | 'kranken-pflegeversicherung'
  | 'riester'
  | 'handwerker'
  | 'haushaltsnahe-dienstleistungen'
  | 'krankheitskosten'
  | 'vorauszahlungen'
  | 'kapitalertraege'
  | 'vermietung'
  | 'rente'

/** A field an item is entered in: a mask id of the interview layer and the field there. */
export interface RecurringItemField {
  readonly screen: string
  readonly field: string
}

interface RecurringItemDef {
  readonly id: RecurringItemId
  /** The checklist's name for the item (user-facing copy). */
  readonly label: string
  readonly fields: readonly RecurringItemField[]
  /** The Bescheid position type the item lands in, for „Wiederholt gekürzt“ (ADR-0099 §5). */
  readonly assessmentType: AssessmentPositionType | null
}

const commute = (field: string): RecurringItemField => ({ screen: 'commute', field })
const interview = (field: string): RecurringItemField => ({ screen: 'interview', field })

/** The catalogue, in the order the checklist shows it: work first, then the household, then the Anlagen. */
const CATALOGUE: readonly RecurringItemDef[] = [
  { id: 'arbeitsweg', label: 'Arbeitsweg', fields: [commute('oneWayKm'), commute('travelDays')], assessmentType: 'fahrtweg' },
  { id: 'homeoffice', label: 'Homeoffice', fields: [commute('homeOfficeDays')], assessmentType: 'homeoffice' },
  { id: 'arbeitsmittel', label: 'Arbeitsmittel', fields: [commute('workEquipmentEur')], assessmentType: 'arbeitsmittel' },
  { id: 'kontofuehrung', label: 'Kontoführung', fields: [commute('accountFeesEur')], assessmentType: 'sonstigeWerbungskosten' },
  { id: 'berufsverbaende', label: 'Gewerkschaft und Berufsverbände', fields: [commute('professionalBodiesEur')], assessmentType: 'sonstigeWerbungskosten' },
  { id: 'fortbildung', label: 'Fortbildung', fields: [interview('fortbildung-kosten')], assessmentType: 'sonstigeWerbungskosten' },
  { id: 'spenden', label: 'Spenden', fields: [interview('spenden-betrag')], assessmentType: 'sonderausgaben' },
  { id: 'kirchensteuer', label: 'Kirchensteuer', fields: [{ screen: 'lstb', field: 'kirchensteuer' }], assessmentType: null },
  { id: 'kinderbetreuung', label: 'Kinderbetreuung', fields: [{ screen: 'kind', field: 'childcareEur' }], assessmentType: 'sonderausgaben' },
  { id: 'krankenkasse-kind', label: 'Krankenkasse Kind', fields: [{ screen: 'kind', field: 'healthBasicEur' }], assessmentType: 'vorsorgeaufwand' },
  { id: 'kranken-pflegeversicherung', label: 'Kranken- und Pflegeversicherung', fields: [interview('kv-pv-betrag')], assessmentType: 'vorsorgeaufwand' },
  { id: 'riester', label: 'Riester', fields: [interview('riester-betrag')], assessmentType: 'sonderausgaben' },
  { id: 'handwerker', label: 'Handwerker', fields: [interview('haushalt-handwerker-betrag')], assessmentType: 'steuerermaessigung35a' },
  { id: 'haushaltsnahe-dienstleistungen', label: 'Haushaltsnahe Dienstleistungen', fields: [interview('haushalt-dienstleistung-betrag')], assessmentType: 'steuerermaessigung35a' },
  { id: 'krankheitskosten', label: 'Krankheitskosten', fields: [interview('gesundheit-betrag')], assessmentType: 'aussergewoehnlicheBelastungen' },
  { id: 'vorauszahlungen', label: 'Vorauszahlungen', fields: [interview('vorauszahlungen-betrag')], assessmentType: 'anrechnung' },
  { id: 'kapitalertraege', label: 'Kapitalerträge', fields: [{ screen: 'kapital', field: 'kapitalertraege' }], assessmentType: null },
  { id: 'vermietung', label: 'Vermietung', fields: [{ screen: 'vermietung', field: 'mieteinnahmen' }], assessmentType: null },
  { id: 'rente', label: 'Rente', fields: [{ screen: 'rente', field: 'jahresbetrag' }], assessmentType: null },
]

/** What a year has of an item: an amount, and for the ways to work the kilometres and days. */
export interface RecurringFact {
  readonly amount: number | null
  readonly km?: number | null
  readonly days?: number | null
}

export type RecurringYearFacts = Partial<Record<RecurringItemId, RecurringFact>>

/** The facts of one year the items are read from, as the API decrypted them. */
export interface RecurringSourceFacts {
  /** Interview answers by question id. */
  readonly answers: Readonly<Record<string, string>>
  readonly commute: {
    readonly oneWayKm: number | null
    readonly travelDays: number | null
    readonly homeOfficeDays: number
    readonly workEquipmentEur: number | null
    readonly accountFeesEur: number | null
    readonly professionalBodiesEur: number | null
  } | null
  readonly children: ReadonlyArray<{ readonly childcareEur: number | null; readonly healthBasicEur: number | null }>
  /** Church tax withheld per LStB (Zeilen 6 und 7). */
  readonly churchTax: number | null
  readonly capitalIncome: number | null
  /** The year's rents over all objects. */
  readonly rentalIncome: number | null
  readonly pensionAmount: number | null
}

/** Interview items: the gate question (null where one gate covers several items) and the amount question. */
const ANSWERED: ReadonlyArray<{ readonly id: RecurringItemId; readonly gate: string | null; readonly amount: string }> = [
  { id: 'fortbildung', gate: 'fortbildung', amount: 'fortbildung-kosten' },
  { id: 'spenden', gate: 'spenden', amount: 'spenden-betrag' },
  { id: 'kranken-pflegeversicherung', gate: 'kv-pv', amount: 'kv-pv-betrag' },
  { id: 'riester', gate: 'riester', amount: 'riester-betrag' },
  { id: 'handwerker', gate: null, amount: 'haushalt-handwerker-betrag' },
  { id: 'haushaltsnahe-dienstleistungen', gate: null, amount: 'haushalt-dienstleistung-betrag' },
  { id: 'krankheitskosten', gate: 'gesundheit-gate', amount: 'gesundheit-betrag' },
  { id: 'vorauszahlungen', gate: 'vorauszahlungen-gate', amount: 'vorauszahlungen-betrag' },
]

const positive = (value: number | null | undefined): number | null => (value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null)

function sumOf(values: ReadonlyArray<number | null>): number | null {
  const present = values.map(positive).filter((v): v is number => v !== null)
  return present.length === 0 ? null : present.reduce((s, v) => s + v, 0)
}

/** Which items a year has: an amount above 0, or a „Ja“ to the item's question without one. */
export function recurringFactsOf(source: RecurringSourceFacts): RecurringYearFacts {
  const facts: Partial<Record<RecurringItemId, RecurringFact>> = {}
  const set = (id: RecurringItemId, fact: RecurringFact | null) => {
    if (fact !== null) facts[id] = fact
  }
  for (const { id, gate, amount } of ANSWERED) {
    const value = positive(Number(source.answers[amount]))
    set(id, value !== null ? { amount: value } : gate !== null && source.answers[gate] === 'Ja' ? { amount: null } : null)
  }
  const way = source.commute
  if (way !== null) {
    set('arbeitsweg', positive(way.oneWayKm) === null ? null : { amount: null, km: way.oneWayKm, days: way.travelDays })
    set('homeoffice', positive(way.homeOfficeDays) === null ? null : { amount: null, days: way.homeOfficeDays })
    for (const [id, value] of [['arbeitsmittel', way.workEquipmentEur], ['kontofuehrung', way.accountFeesEur], ['berufsverbaende', way.professionalBodiesEur]] as const) {
      set(id, positive(value) === null ? null : { amount: value })
    }
  }
  const childcare = sumOf(source.children.map((c) => c.childcareEur))
  const childHealth = sumOf(source.children.map((c) => c.healthBasicEur))
  set('kinderbetreuung', childcare === null ? null : { amount: childcare })
  set('krankenkasse-kind', childHealth === null ? null : { amount: childHealth })
  for (const [id, value] of [['kirchensteuer', source.churchTax], ['kapitalertraege', source.capitalIncome], ['vermietung', source.rentalIncome], ['rente', source.pensionAmount]] as const) {
    set(id, positive(value) === null ? null : { amount: value })
  }
  return facts
}

/** A draft a receipt of the open year staged (ADR-0097), reduced to where it goes and how it stands. */
export interface RecurringReceiptDraft {
  readonly screen: string
  readonly field: string
  readonly status: AdvisorActionStatus
}

export interface RecurringDetail {
  readonly km: number | null
  readonly days: number | null
}

export interface RecurringItem {
  readonly id: RecurringItemId
  readonly label: string
  /** The latest of the last two years that had the item. */
  readonly lastYear: number
  /** That year's amount, as a hint; null where only kilometres and days or a „Ja“ are known. */
  readonly lastAmount: number | null
  readonly lastDetail: RecurringDetail | null
  /** What the open year itself has entered; null while it has nothing (never last year's value). */
  readonly currentAmount: number | null
  readonly currentDetail: RecurringDetail | null
  readonly status: 'erledigt' | 'offen'
  /** What the open year's receipts did for the item: taken over, a proposal waiting, or nothing. */
  readonly receipt: 'uebernommen' | 'vorschlag' | null
  /** Years whose Bescheid cut the position the item lands in. */
  readonly cutInYears: readonly number[]
  readonly fields: readonly RecurringItemField[]
}

export interface RecurringChecklist {
  readonly year: number
  readonly items: readonly RecurringItem[]
  readonly done: number
  readonly open: number
}

export interface RecurringItemsInput {
  /** The open year. */
  readonly year: number
  readonly facts: ReadonlyMap<number, RecurringYearFacts>
  readonly receiptDrafts: readonly RecurringReceiptDraft[]
  /** Cut Bescheid positions by type and year (from „Wiederholt gekürzt“). */
  readonly cuts: ReadonlyArray<{ readonly type: AssessmentPositionType; readonly year: number }>
}

const detailOf = (fact: RecurringFact | undefined): RecurringDetail | null =>
  fact === undefined || (fact.km === undefined && fact.days === undefined) ? null : { km: fact.km ?? null, days: fact.days ?? null }

function receiptOf(def: RecurringItemDef, drafts: readonly RecurringReceiptDraft[]): RecurringItem['receipt'] {
  const own = drafts.filter((d) => def.fields.some((f) => f.screen === d.screen && f.field === d.field))
  if (own.some((d) => d.status === 'applied')) return 'uebernommen'
  return own.some((d) => d.status === 'pending') ? 'vorschlag' : null
}

export function recurringItems(input: RecurringItemsInput): RecurringChecklist {
  const current = input.facts.get(input.year) ?? {}
  const previous = [input.year - 1, input.year - 2]
  const items = CATALOGUE.flatMap((def): RecurringItem[] => {
    const lastYear = previous.find((y) => input.facts.get(y)?.[def.id] !== undefined)
    if (lastYear === undefined) return []
    const last = input.facts.get(lastYear)![def.id]!
    const own = current[def.id]
    const currentDetail = detailOf(own)
    const currentAmount = own?.amount ?? null
    return [
      {
        id: def.id,
        label: def.label,
        lastYear,
        lastAmount: last.amount,
        lastDetail: detailOf(last),
        currentAmount,
        currentDetail,
        status: currentAmount !== null || currentDetail !== null ? 'erledigt' : 'offen',
        receipt: receiptOf(def, input.receiptDrafts),
        cutInYears: def.assessmentType === null ? [] : [...new Set(input.cuts.filter((c) => c.type === def.assessmentType).map((c) => c.year))].sort((a, b) => a - b),
        fields: def.fields,
      },
    ]
  })
  const done = items.filter((i) => i.status === 'erledigt').length
  return { year: input.year, items, done, open: items.length - done }
}
