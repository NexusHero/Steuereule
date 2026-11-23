// Anlage KAP: capital income, split across the spouses by who holds the account (ADR-0054).
import { mandatoryCapitalFields } from '@steuereule/core'
import type { CapitalFacts, PrintoutFacts } from './facts.js'
import { integer, isJoint, jointPersonB, type Fields, type Section } from './section.js'

/**
 * One Anlage KAP. `haelfte` -1 = the whole amount, 0 = the first half (rounded up), 1 = the second half.
 */
export function kapValues(
  capital: CapitalFacts,
  role: 'A' | 'B',
  half: -1 | 0 | 1 | number,
  header: { name: string | null; firstName: string | null },
  steuernummer: string | null,
): Fields {
  const share = (value: string | null | undefined): number => {
    const number = Number(value ?? 0)
    if (half === -1) return number
    return half === 0 ? Math.ceil(number / 2) : Math.floor(number / 2)
  }
  const values: Fields = {}
  values[role === 'A' ? 'anlKap.personA' : 'anlKap.personB'] = true
  if (header.name) values['anlKap.name'] = header.name
  if (header.firstName) values['anlKap.vorname'] = header.firstName
  if (steuernummer) values['anlKap.steuernummer'] = steuernummer
  values['anlKap.guenstigerpruefung'] = '1'
  if (capital.depot === 'deutscher-broker') {
    values['anlKap.kz210'] = String(share(capital.kapitalertraege))
    values['anlKap.kz217'] = String(share(capital.sparerPauschbetrag))
    values['anlKap.kz280'] = `${share(capital.kapitalertragsteuer)},00`
    values['anlKap.kz281'] = `${share(capital.solidaritaetszuschlag)},00`
    values['anlKap.kz282'] = `${share(capital.kirchensteuer)},00`
  } else {
    values['anlKap.kz234'] = String(share(capital.kapitalertraege))
    values['anlKap.kz217'] = '0'
    values['anlKap.kz218'] = String(share(capital.sparerPauschbetrag))
  }
  return values
}

/**
 * One Anlage KAP onto the main set, or in a joint return one per spouse: a joint account is split half
 * and half, an account of Person B goes onto B's Anlage KAP (ADR-0054). A gets the odd euro.
 */
export function capitalSection(facts: PrintoutFacts): Section {
  const { capital, profile } = facts
  if (!capital || capital.kapitalertraege == null) return {}
  const complete = mandatoryCapitalFields(capital.depot).every((field) => integer(capital[field] ?? null) !== null)
  if (capital.depot === 'krypto') return { missing: ['anlageKapKrypto'] }
  if (capital.depot === 'unbekannt' || !complete) return { missing: ['kapital'] }
  const b = jointPersonB(facts)
  const inhaber = isJoint(facts) ? (capital.inhaber ?? 'A') : 'A'
  const headerA = { name: profile.lastName, firstName: profile.firstName }
  const headerB = { name: b?.lastName ?? null, firstName: b?.firstName ?? null }
  const parts: ['A' | 'B', number][] = inhaber === 'gemeinsam' ? [['A', 0], ['B', 1]] : inhaber === 'B' ? [['B', -1]] : [['A', -1]]
  const kapInstances = parts.map(([role, half]) => kapValues(capital, role, half, role === 'A' ? headerA : headerB, profile.steuernummer))
  if (kapInstances.length === 1 && parts[0]![0] === 'A') return { values: kapInstances[0]! }
  return { instances: { 'anlage-kap': kapInstances } }
}
