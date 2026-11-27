import { formatEuro, formatEuroRange } from '@steuereule/core'
import { latestLineOf, lineIdsOf, lineOf } from './fill-in-lines.js'
import type { LiveForm } from './live-values.js'
import type { PrintoutEstimateState } from './printout-estimate.port.js'

/**
 * The SteuerEule summary that leads the paid printout: the expected result step by step, then what
 * was entered, form by form with the line of the Vordruck. It is for the user's own files, never
 * part of the return. Every figure comes from the estimate the cockpit shows (ADR-0052): this module
 * arranges and words them, it never calculates a second time.
 */
export interface SummaryInput {
  readonly taxYear: number
  /** ISO date (yyyy-mm-dd) the printout is created on. */
  readonly createdOn: string
  /** Person A first; a second name only for a joint return. */
  readonly persons: readonly string[]
  /** The cockpit's estimate; null when it could not be read. */
  readonly estimate: PrintoutEstimateState | null
  /** The copies the printout prints, in form order. */
  readonly forms: readonly LiveForm[]
  /** What tells two copies of a form apart (a child's first name, a property's street). */
  readonly names: Readonly<Record<string, string | null>>
}

export type SummaryStepKind = 'plus' | 'minus' | 'subtotal' | 'result'

export interface SummaryStep {
  readonly label: string
  /** Formatted in euros; a range where the estimate is one. */
  readonly amount: string
  readonly kind: SummaryStepKind
  /** A short line under the label, where a figure needs it. */
  readonly detail?: string
}

export interface SummaryRow {
  /** The Zeile on the year's Vordruck; null for a box in the page head or a field that year lacks. */
  readonly zeile: string | null
  readonly label: string
  readonly value: string
}

export interface SummarySection {
  readonly title: string
  readonly rows: readonly SummaryRow[]
}

export interface PrintoutSummary {
  readonly taxYear: number
  readonly createdOn: string
  readonly persons: readonly string[]
  /** The result in one line, or that it cannot be calculated yet. */
  readonly headline: string
  readonly steps: readonly SummaryStep[]
  readonly notes: readonly string[]
  readonly sections: readonly SummarySection[]
}

const FORM_TITLES: Readonly<Record<string, string>> = {
  'est-1-a': 'Hauptvordruck ESt 1 A',
  'anlage-n': 'Anlage N',
  'anlage-r': 'Anlage R',
  'anlage-kap': 'Anlage KAP',
  'anlage-n-gre': 'Anlage N-Gre',
  'anlage-v': 'Anlage V',
  'anlage-kind': 'Anlage Kind',
  'anlage-sonderausgaben': 'Anlage Sonderausgaben',
  'anlage-aussergewoehnliche-belastungen': 'Anlage Außergewöhnliche Belastungen',
  'anlage-haushaltsnahe-aufwendungen': 'Anlage Haushaltsnahe Aufwendungen',
  'anlage-av': 'Anlage AV',
  'anlage-vorsorgeaufwand': 'Anlage Vorsorgeaufwand',
}

interface Range {
  readonly from: number
  readonly to: number
}

const euro = (n: number): string => formatEuro(Math.round(n))
const euroRange = (r: Range): string => formatEuroRange(Math.round(Math.min(r.from, r.to)), Math.round(Math.max(r.from, r.to)))

export function buildPrintoutSummary(input: SummaryInput): PrintoutSummary {
  const steps = resultSteps(input)
  return {
    taxYear: input.taxYear,
    createdOn: germanDate(input.createdOn),
    persons: input.persons,
    headline: headlineOf(input.estimate),
    steps,
    notes: notesOf(input.estimate),
    sections: sectionsOf(input),
  }
}

function germanDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

/** A refund over the whole range, a back payment over the whole range, or a range across zero. */
function resultWording(result: Range): { readonly label: string; readonly amount: string } {
  if (result.to < 0) return { label: 'Voraussichtliche Nachzahlung', amount: euroRange({ from: -result.to, to: -result.from }) }
  if (result.from >= 0) return { label: 'Voraussichtliche Erstattung', amount: euroRange(result) }
  return { label: 'Voraussichtliches Ergebnis', amount: `${euro(-result.from)} Nachzahlung bis ${euro(result.to)} Erstattung` }
}

function headlineOf(estimate: PrintoutEstimateState | null): string {
  if (estimate?.kind !== 'spanne' || estimate.result === undefined) return 'Das Ergebnis lässt sich noch nicht berechnen.'
  const { label, amount } = resultWording(estimate.result)
  return `${label}: ${amount}`
}

function resultSteps(input: SummaryInput): SummaryStep[] {
  const e = input.estimate
  if (e?.kind !== 'spanne' || e.result === undefined) return []
  const b = e.breakdown
  const steps: SummaryStep[] = []
  const add = (label: string, amount: string, kind: SummaryStepKind, detail?: string) => steps.push(detail === undefined ? { label, amount, kind } : { label, amount, kind, detail })

  b?.persons?.forEach((person, i) => {
    const name = input.persons[i] ?? `Person ${i === 0 ? 'A' : 'B'}`
    add(`Einkünfte ${name}`, euro(person.incomeEur), 'plus', person.workExpensesEur > 0 ? `nach Werbungskosten von ${euro(person.workExpensesEur)}` : undefined)
  })
  if (b?.rentalSurplusEur !== undefined) add('Vermietung und Verpachtung', euro(b.rentalSurplusEur), 'plus')
  if (e.business && e.business.selfEmployedEur !== 0) add('Selbstständige Arbeit', euro(e.business.selfEmployedEur), 'plus')
  if (e.business && e.business.tradeEur !== 0) add('Gewerbebetrieb', euro(e.business.tradeEur), 'plus')
  if (b) add('Summe der Einkünfte', euro(b.totalIncomeEur), 'subtotal')

  if (e.provision) add('Vorsorgeaufwendungen', euroRange(e.provision), 'minus')
  if (e.specialExpenses !== undefined && e.specialExpenses > 0) add('Sonderausgaben', euro(e.specialExpenses), 'minus')
  if (b && b.extraordinaryBurdenEur > 0) add('Außergewöhnliche Belastungen', euro(b.extraordinaryBurdenEur), 'minus', 'nach Abzug der zumutbaren Belastung')
  if (b?.childAllowance?.used) add('Kinderfreibetrag', euro(b.childAllowance.allowanceEur), 'minus', `günstiger als das Kindergeld von ${euro(b.childAllowance.childBenefitEur)}, das der Steuer hinzugerechnet ist`)
  if (e.taxableIncome) add('Zu versteuerndes Einkommen', euroRange(e.taxableIncome), 'subtotal')

  if (b) add('Tarifliche Einkommensteuer', euroRange(b.tariffTax), 'plus', b.progressionIncomeEur !== undefined ? `Steuersatz erhöht durch ${euro(b.progressionIncomeEur)} steuerfreie Einkünfte (Progressionsvorbehalt)` : undefined)
  if (b && b.householdReductionEur > 0) add('Steuerermäßigung nach § 35a EStG', euro(b.householdReductionEur), 'minus')
  if (b?.capitalFlatTaxEur !== undefined && b.capitalFlatTaxEur > 0) add('Abgeltungsteuer auf Kapitalerträge', euro(b.capitalFlatTaxEur), 'plus')
  if (e.incomeTax) add('Festzusetzende Einkommensteuer', euroRange(e.incomeTax), 'subtotal')
  if (e.solidaritaetszuschlag) add('Solidaritätszuschlag', euroRange(e.solidaritaetszuschlag), 'plus')
  if (e.churchTax?.kind === 'spanne') add('Kirchensteuer', euroRange(e.churchTax.due), 'plus', e.churchTax.withheld > 0 ? `davon bereits einbehalten: ${euro(e.churchTax.withheld)}` : undefined)

  if (e.anrechnung !== undefined) add('Bereits gezahlt (einbehaltene Steuer)', euro(e.anrechnung), 'minus')
  // On the business path the prepayments are part of the credited tax already (ADR-0101): never twice.
  if (e.prepayments !== undefined && e.prepayments > 0 && e.business === undefined) add('Vorauszahlungen', euro(e.prepayments), 'minus')

  const { label, amount } = resultWording(e.result)
  add(label, amount, 'result')
  return steps
}

function notesOf(estimate: PrintoutEstimateState | null): string[] {
  const notes = ['Das Ergebnis ist eine Schätzung aus deinen Angaben. Maßgeblich ist der Steuerbescheid des Finanzamts.']
  if (estimate?.kind !== 'spanne') return notes
  if (estimate.result !== undefined && estimate.result.from !== estimate.result.to) notes.push('Eine Spanne steht dort, wo ein Betrag noch nicht auf den Euro feststeht.')
  if (estimate.churchTaxOpen) notes.push('Die Kirchensteuer ist im Ergebnis noch nicht enthalten.')
  const later = estimate.laterAmounts ?? 0
  if (later > 0) notes.push(`${later} ${later === 1 ? 'Betrag ist' : 'Beträge sind'} noch offen und nicht eingerechnet.`)
  return notes
}

function sectionsOf(input: SummaryInput): SummarySection[] {
  const sections: SummarySection[] = []
  for (const form of input.forms) {
    const title = FORM_TITLES[form.formular] ?? form.formular
    form.instances.forEach((copy, index) => {
      const several = form.instances.length > 1
      const name = copy.entityId !== null ? (input.names[copy.entityId] ?? null) : null
      const suffix = several ? (name ?? (copy.person !== null ? `Person ${copy.person}` : String(index + 1))) : copy.person !== null && input.persons.length > 1 ? `Person ${copy.person}` : null
      sections.push({ title: suffix === null ? title : `${title} · ${suffix}`, rows: rowsOf(input.taxYear, form.formular, copy.values) })
    })
  }
  return sections
}

/** The copy's values in the order of the year's Vordruck; a field that year's form lacks goes last, without a Zeile. */
function rowsOf(year: number, formular: string, values: LiveForm['instances'][number]['values']): SummaryRow[] {
  const order = new Map(lineIdsOf(year, formular).map((id, position) => [id, position]))
  return Object.keys(values)
    .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
    .map((id) => {
      const line = lineOf(year, id)
      const named = line ?? latestLineOf(id)
      const value = values[id]!
      return {
        zeile: line?.zeile ?? null,
        label: named === null ? id : named.spalte ? `${named.label} (${named.spalte})` : named.label,
        value: value === true ? 'X' : value,
      }
    })
}
