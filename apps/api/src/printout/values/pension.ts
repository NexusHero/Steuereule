// Anlage R: statutory and private pensions; company and foreign pensions need forms not printed yet.
import type { FieldValues } from '../form-renderer.js'
import type { PrintoutFacts } from './facts.js'
import { formHeader, jointPersonB, wholeEuros, type Fields, type Section } from './section.js'

const PENSION_CODE: Record<string, string> = {
  GesetzlicheRente: 'anlR.kz101',
  WitwenWaisenrente: 'anlR.kz101',
  PrivateRentenversicherung: 'anlR.kz131',
}

const PENSION_OTHER_FORM: Record<string, string> = {
  Betriebsrente: 'anlageRAvBav',
  AuslaendischeRente: 'anlageRAus',
}

type Pension = PrintoutFacts['pension']

/** The Kennzahl and amount of a pension the Anlage R takes, or null. */
function printablePension(pension: Pension): { readonly code: string; readonly amount: string } | null {
  const code = pension?.rentenart ? PENSION_CODE[pension.rentenart] : undefined
  const amount = wholeEuros(pension?.jahresbetrag)
  return code && amount !== null ? { code, amount } : null
}

function otherFormGaps(pensions: readonly Pension[]): string[] {
  const missing: string[] = []
  for (const pension of pensions) {
    const otherForm = pension?.rentenart ? PENSION_OTHER_FORM[pension.rentenart] : undefined
    if (otherForm && !missing.includes(otherForm)) missing.push(otherForm)
  }
  return missing
}

function anlageRValues(
  pension: { readonly code: string; readonly amount: string },
  role: 'A' | 'B',
  person: { readonly lastName: string | null | undefined; readonly firstName: string | null | undefined },
  steuernummer: string | null,
): Fields {
  return { [pension.code]: pension.amount, [`anlR.person${role}`]: true, 'anlR.lfdNr': '1', ...formHeader('anlR', person, steuernummer) }
}

/** Person A's Anlage R goes onto the main set; once Person B has a pension each spouse gets an instance. */
export function pensionSection(facts: PrintoutFacts): Section {
  const { profile } = facts
  const personB = jointPersonB(facts)
  const missing = otherFormGaps([facts.pension, personB?.pension ?? null])
  const a = printablePension(facts.pension)
  const b = printablePension(personB?.pension ?? null)
  const rA = a ? anlageRValues(a, 'A', profile, profile.steuernummer) : null
  if (!b) return rA ? { values: rA, missing } : { missing }
  const instances: FieldValues[] = [...(rA ? [rA] : []), anlageRValues(b, 'B', { lastName: personB?.lastName, firstName: personB?.firstName }, profile.steuernummer)]
  return { instances: { 'anlage-r': instances }, missing }
}
