// Anlage Vorsorgeaufwand: self-paid health and care insurance of both spouses.
import type { HealthInsurance } from '@steuereule/core'
import type { PrintoutFacts } from './facts.js'
import { formHeader, jointPersonB, type Section } from './section.js'

/**
 * Anlage Vorsorgeaufwand for self-paid insurance (Person A Kennzahlen 3xx): voluntary statutory Z. 16–18
 * and 22, private Z. 23, 24 and 27, foreign Z. 28–30 and 33. Contributions withheld from a German salary
 * are e-data (Z. 11–13) and Swiss ones via the employer are in the Anlage N-Gre — neither is repeated here.
 */
export function provisionExpensesValues(insurances: readonly HealthInsurance[] | null | undefined, role: 'A' | 'B' = 'A'): Record<string, string> {
  const sums = new Map<string, number>()
  const add = (kz: string, amount: number) => sums.set(kz, (sums.get(kz) ?? 0) + amount)
  for (const kv of insurances ?? []) {
    if (kv.kind === 'gesetzlich') {
      add('326', kv.basicHealthAmount)
      if (kv.withSickPay) add('328', kv.basicHealthAmount)
      add('329', kv.careInsuranceAmount)
      add('338', kv.optionalExtrasAmount)
    } else if (kv.kind === 'privat') {
      add('350', kv.basicHealthAmount)
      add('351', kv.careInsuranceAmount)
      add('354', kv.optionalExtrasAmount)
    } else {
      add('333', kv.basicHealthAmount)
      if (!kv.withSickPay) add('334', kv.basicHealthAmount)
      add('335', kv.careInsuranceAmount)
      add('339', kv.optionalExtrasAmount)
    }
  }
  const values: Record<string, string> = {}
  // Person B's column carries the same Kennzahlen with a leading 4 instead of 3.
  for (const [kz, rawAmount] of sums) if (rawAmount > 0) values[`anlVor.kz${role === 'A' ? kz : `4${kz.slice(1)}`}`] = String(rawAmount)
  return values
}

export function provisionExpensesSection(facts: PrintoutFacts): Section {
  const provision = {
    ...provisionExpensesValues(facts.healthInsurance),
    ...provisionExpensesValues(jointPersonB(facts)?.healthInsurance, 'B'),
  }
  if (Object.keys(provision).length === 0) return {}
  return { values: { ...formHeader('anlVor', facts.profile, facts.profile.steuernummer), ...provision } }
}
