// Anlage AV: the contributions come from the provider; the form needs the kind of eligibility.
import type { PrintoutFacts } from './facts.js'
import { formHeader, wholeEuros, type Section } from './section.js'

export function riesterSection({ riester, profile }: PrintoutFacts): Section {
  if (!riester) return {}
  const income = riester.kind === 'Unmittelbar' ? wholeEuros(riester.incomeLastYear) : null
  if (income === null && riester.kind !== 'Mittelbar') return { missing: ['riester'] }
  const header = formHeader('anlAv', profile, profile.steuernummer)
  if (income !== null) return { values: { ...header, 'anlAv.unmittelbar': '1', 'anlAv.kz100': income } }
  return { values: { ...header, 'anlAv.mittelbar': '2' } }
}
