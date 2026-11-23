import type { FieldValues } from './form-renderer.js'
import { capitalSection } from './values/capital.js'
import { CHILD_GAP_ORDER, childrenNamedSection, childrenSection, type ChildGapField } from './values/children.js'
import { crossBorderSection } from './values/cross-border.js'
import { employmentSection } from './values/employment.js'
import type { PrintoutFacts } from './values/facts.js'
import { extraordinaryBurdensSection, householdServicesSection } from './values/household-and-health.js'
import { lifeSituationsWithoutPrintoutSection } from './values/life-situations.js'
import { mainFormSection, progressionClauseSection } from './values/main-form.js'
import { pensionSection } from './values/pension.js'
import { provisionExpensesSection } from './values/provision-expenses.js'
import { rentalSection } from './values/rental.js'
import { riesterSection } from './values/riester.js'
import type { Fields, Section } from './values/section.js'
import { specialExpensesSection } from './values/special-expenses.js'

export type * from './values/facts.js'
export type { ChildGapField } from './values/children.js'

export interface PrintoutValues {
  values: FieldValues
  instances?: Record<string, FieldValues[]>
  missing: string[]
  /** Which details of the children are behind a „kinder“ entry in `missing`; empty without one. */
  missingChildFields: ChildGapField[]
}

/**
 * The field values of every form from the stored facts, and what still blocks the print. Each form
 * section or Anlage has its own builder under `values/`; this only puts them together, in the order in
 * which the gaps are named.
 */
export function printoutValues(facts: PrintoutFacts): PrintoutValues {
  const crossBorder = crossBorderSection(facts)
  return compose([
    mainFormSection(facts),
    employmentSection(facts),
    pensionSection(facts),
    capitalSection(facts),
    progressionClauseSection(facts, crossBorder.accidentBenefitEur),
    crossBorder,
    childrenNamedSection(facts),
    lifeSituationsWithoutPrintoutSection(facts),
    rentalSection(facts),
    childrenSection(facts),
    specialExpensesSection(facts),
    provisionExpensesSection(facts),
    extraordinaryBurdensSection(facts),
    householdServicesSection(facts),
    riesterSection(facts),
  ])
}

function compose(sections: readonly Section[]): PrintoutValues {
  const values: Fields = {}
  const instances: Record<string, FieldValues[]> = {}
  const missing: string[] = []
  const childFields = new Set<ChildGapField>()
  for (const section of sections) {
    Object.assign(values, section.values)
    Object.assign(instances, section.instances)
    missing.push(...(section.missing ?? []))
    for (const field of section.childFields ?? []) childFields.add(field)
  }
  const result: PrintoutValues = { values, missing, missingChildFields: CHILD_GAP_ORDER.filter((field) => childFields.has(field)) }
  if (Object.keys(instances).length > 0) result.instances = instances
  return result
}
