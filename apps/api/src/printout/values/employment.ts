// Anlage N: the German wage, the commute and the further Werbungskosten of each employed person.
import type { FieldValues } from '../form-renderer.js'
import type { ChSalaryCertificateFacts, CommuteFacts, LifeSituationFacts, PrintoutFacts } from './facts.js'
import { addLifeSituationWorkExpenses } from './life-situations.js'
import { formHeader, germanWages, jointPersonB, type Fields, type Section } from './section.js'
import { commuteValues, waysInAnlageN } from './work-expenses.js'

interface Employee {
  readonly role: 'A' | 'B'
  readonly gross: string
  readonly lastName: string | null | undefined
  readonly firstName: string | null | undefined
  readonly commute: CommuteFacts | null | undefined
  readonly chSalaryCertificate: ChSalaryCertificateFacts | null | undefined
  readonly lifeSituations: LifeSituationFacts | null | undefined
}

/** One Anlage N. A Grenzgänger's commute is in their Anlage N-Gre unless they changed employer (ADR-0079). */
export function anlageNValues(person: Employee, steuernummer: string | null): Fields {
  const values: Fields = { 'anlN.kz110': person.gross, [`anlN.person${person.role}`]: true }
  const ways = waysInAnlageN(person.commute, person.chSalaryCertificate)
  if (ways) Object.assign(values, commuteValues(person.commute, 'anlN', ways))
  addLifeSituationWorkExpenses(values, 'anlN', person.lifeSituations)
  return Object.assign(values, formHeader('anlN', person, steuernummer))
}

/** Person A's Anlage N goes onto the main set; once Person B has a German wage each spouse gets an instance. */
export function employmentSection(facts: PrintoutFacts): Section {
  const { profile } = facts
  const wages = germanWages(facts)
  const a: Employee | null =
    wages.a === null
      ? null
      : {
          role: 'A',
          gross: wages.a,
          lastName: profile.lastName,
          firstName: profile.firstName,
          commute: facts.commute,
          chSalaryCertificate: facts.chSalaryCertificate,
          lifeSituations: facts.lifeSituations,
        }
  if (wages.b === null) return a ? { values: anlageNValues(a, profile.steuernummer) } : {}
  const b = jointPersonB(facts)
  const nB: Employee = {
    role: 'B',
    gross: wages.b,
    lastName: b?.lastName,
    firstName: b?.firstName,
    commute: b?.commute,
    chSalaryCertificate: b?.chSalaryCertificate,
    lifeSituations: b?.lifeSituations,
  }
  const instances: FieldValues[] = [...(a ? [anlageNValues(a, profile.steuernummer)] : []), anlageNValues(nB, profile.steuernummer)]
  return { instances: { 'anlage-n': instances } }
}
