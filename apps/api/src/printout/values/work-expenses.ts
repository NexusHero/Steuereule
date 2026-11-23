// The commute (Entfernungspauschale) and the further Werbungskosten, shared by Anlage N and Anlage N-Gre.
import type { ChSalaryCertificateFacts, CommuteFacts, WaysInForm, WorkExpenseFacts } from './facts.js'
import type { Fields } from './section.js'

/** Where Anlage N and Anlage N-Gre ask for the further Werbungskosten: the same Kennzahlen in other lines. */
const WORK_EXPENSE_LINES = {
  anlN: { bodies: 'z53Text', tools: 'z54', sonstiges: ['z62', 'z63'] },
  anlNGre: { bodies: 'z48Text', tools: 'z49', sonstiges: ['z57', 'z58'] },
} as const

/** Kz 310 (professional bodies), 320 (work tools) and 380 (account fees and other) with their lines. */
function workExpenseValues(x: WorkExpenseFacts | null | undefined, prefix: 'anlN' | 'anlNGre'): Record<string, string> {
  if (!x) return {}
  const lines = WORK_EXPENSE_LINES[prefix]
  const values: Record<string, string> = {}
  if (x.professionalBodiesEur) {
    values[`${prefix}.${lines.bodies}`] = x.professionalBodiesNote ?? 'Beiträge zu Berufsverbänden'
    values[`${prefix}.kz310`] = String(x.professionalBodiesEur)
  }
  if (x.workEquipmentEur) {
    values[`${prefix}.${lines.tools}Text`] = x.workEquipmentNote ?? 'Arbeitsmittel'
    values[`${prefix}.${lines.tools}Eur`] = String(x.workEquipmentEur)
    values[`${prefix}.kz320`] = String(x.workEquipmentEur)
  }
  const sonstiges = [
    ...(x.accountFeesEur ? [['Kontoführungsgebühren', x.accountFeesEur] as const] : []),
    ...(x.otherWorkExpensesEur ? [[x.otherWorkExpensesNote ?? 'Sonstige Werbungskosten', x.otherWorkExpensesEur] as const] : []),
  ]
  sonstiges.forEach(([text, eur], i) => {
    values[`${prefix}.${lines.sonstiges[i]}Text`] = text
    values[`${prefix}.${lines.sonstiges[i]}Eur`] = String(eur)
  })
  if (sonstiges.length > 0) values[`${prefix}.kz380`] = String(sonstiges.reduce((sum, [, eur]) => sum + eur, 0))
  return values
}

/**
 * One more „Sonstiges“ Werbungskosten line (Kz 380): the first free line, or — when both are taken —
 * added to the last one under a general label, so the sum in Kz 380 always holds.
 */
export function addOtherWorkExpense(values: Fields, prefix: 'anlN' | 'anlNGre', text: string, eur: number): void {
  if (eur <= 0) return
  const [first, second] = WORK_EXPENSE_LINES[prefix].sonstiges
  const free = [first, second].find((line) => values[`${prefix}.${line}Eur`] === undefined)
  if (free !== undefined) {
    values[`${prefix}.${free}Text`] = text
    values[`${prefix}.${free}Eur`] = String(eur)
  } else {
    values[`${prefix}.${second}Text`] = 'Weitere Werbungskosten'
    values[`${prefix}.${second}Eur`] = String(Number(values[`${prefix}.${second}Eur`]) + eur)
  }
  values[`${prefix}.kz380`] = String(Number(values[`${prefix}.kz380`] ?? 0) + eur)
}

/** The form's vom/bis boxes take day and month („01.11.“); the year is the tax year. */
const dayAndMonth = (date: string | null | undefined): string | null => (date && /^\d{2}\.\d{2}\./.test(date) ? date.slice(0, 6) : null)

interface OneWay {
  commuteDays: number
  oneWayKm: number
  withCar: boolean
  workplace: string | null
  from: string | null
  to: string | null
}

/** One way in the 1. Angabe (Kz 110–112) or the 2. Angabe (Kz 130–132) of the form. */
function wayValues(way: OneWay, workdaysPerWeek: number, daysOff: number, prefix: 'anlN' | 'anlNGre', slot: 1 | 2): Record<string, string> {
  const [w, kzDays, kzKm, kzCar] = slot === 1 ? ['weg', 'kz110Tage', 'kz111', 'kz112'] : ['weg2', 'kz130Tage', 'kz131', 'kz132']
  const values: Record<string, string> = {
    [`${prefix}.${w}Art`]: '1',
    [`${prefix}.${w}TageJeWoche`]: String(workdaysPerWeek),
    [`${prefix}.${w}FreieTage`]: String(daysOff),
    [`${prefix}.${kzDays}`]: String(way.commuteDays),
    [`${prefix}.${kzKm}`]: String(way.oneWayKm),
  }
  if (way.workplace) values[`${prefix}.${w}Ort`] = way.workplace
  if (way.withCar) values[`${prefix}.${kzCar}`] = String(way.oneWayKm)
  const from = dayAndMonth(way.from)
  const to = dayAndMonth(way.to)
  if (from) values[`${prefix}.${w}Von`] = from
  if (to) values[`${prefix}.${w}Bis`] = to
  return values
}

/**
 * Anlage N Z. 27–42 and Anlage N-Gre Z. 32–46 ask the same facts under their own field prefix. The further
 * Werbungskosten go with the first way, so a person split over two forms has them once.
 */
export function commuteValues(a: CommuteFacts | null | undefined, prefix: 'anlN' | 'anlNGre' = 'anlN', ways: WaysInForm = 'all'): Record<string, string> {
  if (!a) return {}
  const values: Record<string, string> = ways === 'second' ? {} : workExpenseValues(a.workExpenses, prefix)
  const first: OneWay | null =
    a.oneWayKm === null ? null : { commuteDays: a.commuteDays, oneWayKm: a.oneWayKm, withCar: a.withCar, workplace: a.workplace, from: a.from ?? null, to: a.to ?? null }
  const second = a.second ?? null
  if (ways === 'second') {
    if (second) Object.assign(values, wayValues(second, a.workdaysPerWeek, a.daysOff, prefix, 1))
    return values
  }
  if (first) Object.assign(values, wayValues(first, a.workdaysPerWeek, a.daysOff, prefix, 1))
  if (ways === 'all' && second) Object.assign(values, wayValues(second, a.workdaysPerWeek, a.daysOff, prefix, first ? 2 : 1))
  return values
}

/**
 * A person with a German and a Swiss wage in one year: the way while employed in Germany belongs to the
 * Anlage N, the one after the change to the N-Gre. Without a second way the one way goes to the N-Gre only.
 */
export function waysInAnlageN(commute: CommuteFacts | null | undefined, ch: ChSalaryCertificateFacts | null | undefined): WaysInForm | null {
  if (!ch || ch.grossWageChf === null) return 'all'
  return commute?.second ? 'first' : null
}

export function waysInNGre(commute: CommuteFacts | null | undefined, hasGermanWage: boolean): WaysInForm {
  return hasGermanWage && commute?.second ? 'second' : 'all'
}
