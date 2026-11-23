// What the Lebenslagen (ADR-0090) add to the forms of the person who answered them.
import type { LifeSituationFacts, PrintoutFacts } from './facts.js'
import { jointPersonB, type Fields, type Section } from './section.js'
import { addOtherWorkExpense } from './work-expenses.js'

/** Work expenses of the life situations into the form that holds the person's work expenses. */
export function addLifeSituationWorkExpenses(target: Fields, prefix: 'anlN' | 'anlNGre', ls: LifeSituationFacts | null | undefined): void {
  if (!ls) return
  if (ls.trainingEur) target[`${prefix}.kz330`] = String(ls.trainingEur)
  if (ls.relocationEur) addOtherWorkExpense(target, prefix, 'Umzugskosten (beruflich veranlasst)', ls.relocationEur)
}

/** The life situations whose forms are not printed yet: an Abfindung and a doppelte Haushaltsführung. */
export function lifeSituationsWithoutPrintoutSection(facts: PrintoutFacts): Section {
  const missing: string[] = []
  for (const ls of [facts.lifeSituations, jointPersonB(facts)?.lifeSituations]) {
    if (ls?.severance && !missing.includes('anlageNEntschaedigung')) missing.push('anlageNEntschaedigung')
    if (ls?.secondHousehold && !missing.includes('anlageNDhf')) missing.push('anlageNDhf')
  }
  return { missing }
}
