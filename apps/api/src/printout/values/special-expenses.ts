// Anlage Sonderausgaben: donations.
import type { PrintoutFacts } from './facts.js'
import { formHeader, wholeEuros, type Section } from './section.js'

export function specialExpensesSection({ specialExpenses, profile }: PrintoutFacts): Section {
  const donations = wholeEuros(specialExpenses?.donations)
  if (donations === null) return {}
  return { values: { ...formHeader('anlSo', profile, profile.steuernummer), 'anlSo.spenden': donations } }
}
