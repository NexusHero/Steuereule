import { describe, expect, it } from 'vitest'
import { INCOME_TYPES, incomeTypesFromAnswers, gatedIncomeTypes, isIncomeType } from './einkunftsarten'
import type { Answers } from './interview'

// ADR-010/030 — the derivation is the load-bearing piece: it is the bridge between the
// onboarding shorthand (interview answers) and the fachliche truth (Einkunftsarten). Every
// case below asserts the IDENTITY of the resulting set, not merely its size (the trap
// #318 names: a test that says "two Einkunftsarten appear" stays green when the wrong two
// do). The combinability cases (ADR-030/034) are the ones that matter most.

describe('isEinkunftsart', () => {
  it('accepts every declared Einkunftsart', () => {
    for (const art of INCOME_TYPES) expect(isIncomeType(art)).toBe(true)
  })

  it('rejects an undeclared string, total over string', () => {
    expect(isIncomeType('Landwirtschaft')).toBe(false)
    expect(isIncomeType('')).toBe(false)
    expect(isIncomeType('Kapitalerträge')).toBe(false) // the interview VALUE, not the Einkunftsart id
  })
})

describe('einkunftsartenFromAnswers — the onboarding-shorthand → Einkunftsart bridge (ADR-010)', () => {
  it('nothing answered declares nothing', () => {
    expect(incomeTypesFromAnswers({})).toEqual([])
  })

  it.each([
    ['Angestellt', ['Nichtselbstständig'] as const],
    ['Selbstständig', ['Gewerbe'] as const],
    ['Beides', ['Nichtselbstständig', 'Gewerbe'] as const],
    ['Rente', ['Rente'] as const],
  ] as const)('job=%s declares exactly the expected Einkunftsart set', (job, expected) => {
    expect(incomeTypesFromAnswers({ job })).toEqual([...expected])
  })

  it.each([
    ['Ja, in die Schweiz', ['Grenzgänger'] as const],
    ['Nein', [] as const],
    ['In ein anderes Land', [] as const], // the CH-only gate — no computable category (honest)
  ] as const)('ausland=%s declares exactly the expected Einkunftsart set', (ausland, expected) => {
    expect(incomeTypesFromAnswers({ job: 'Angestellt', ausland })).toEqual(['Nichtselbstständig', ...expected])
  })

  it.each([
    ['Kapitalerträge', ['Kapital'] as const],
    ['Vermietung', ['Vermietung'] as const],
    // canonical order (EINKUNFTSARTEN): Vermietung precedes Kapital.
    ['Beides', ['Vermietung', 'Kapital'] as const],
    ['Nein', [] as const],
  ] as const)('einkuenfte=%s declares exactly the expected Einkunftsart set', (einkuenfte, expected) => {
    expect(incomeTypesFromAnswers({ job: 'Angestellt', einkuenfte })).toEqual(['Nichtselbstständig', ...expected])
  })

  // ADR-030/034 — the combinability cases. Each is a NORMAL real person, not a synthetic
  // corner: a Grenzgänger who also rents out and holds capital; a pensioner who also
  // rents and holds capital. If any of these fails, the "frei kombinierbar" claim is false.
  it('ADR-030 — Grenzgänger + Kapital + Vermietung + Nichtselbstständig combine freely', () => {
    const answers: Answers = {
      job: 'Angestellt',
      ausland: 'Ja, in die Schweiz',
      einkuenfte: 'Beides',
    }
    expect(incomeTypesFromAnswers(answers)).toEqual([
      'Nichtselbstständig',
      'Vermietung',
      'Kapital',
      'Grenzgänger',
    ])
  })

  it('ADR-034 — Rente + Vermietung + Kapital is the normal pensioner case, freely combinable', () => {
    const answers: Answers = { job: 'Rente', einkuenfte: 'Beides' }
    expect(incomeTypesFromAnswers(answers)).toEqual(['Vermietung', 'Kapital', 'Rente'])
  })

  it('Rente does not exclude other Einkunftsarten (ADR-034: Rente is an option, not a branch)', () => {
    const answers: Answers = { job: 'Rente', ausland: 'Ja, in die Schweiz', einkuenfte: 'Vermietung' }
    expect(incomeTypesFromAnswers(answers)).toEqual(['Vermietung', 'Rente', 'Grenzgänger'])
  })

  it('ADR-030/034 — Rente + Vermietung + Kapital + Grenzgänger all combine freely (ticket 10.4)', () => {
    const answers: Answers = { job: 'Rente', ausland: 'Ja, in die Schweiz', einkuenfte: 'Beides' }
    expect(incomeTypesFromAnswers(answers)).toEqual(['Vermietung', 'Kapital', 'Rente', 'Grenzgänger'])
  })

  it('returns a deterministic, deduplicated, canonical-order set', () => {
    // "Beides" adds two Einkunftsarten from one answer; the result must carry no duplicates
    // and follow EINKUNFTSARTEN order regardless of how many answers contributed.
    const answers: Answers = { job: 'Beides', einkuenfte: 'Beides' }
    const result = incomeTypesFromAnswers(answers)
    expect(result).toEqual(['Nichtselbstständig', 'Gewerbe', 'Vermietung', 'Kapital'])
    expect(new Set(result).size).toBe(result.length)
  })
})

describe('gatedEinkunftsarten — which declared Einkunftsarten 1.0 cannot compute (ADR-028/032/033)', () => {
  it('Gewerbe is gated whenever declared (ADR-028: EÜR stays out), Selbstständig and Beides alike', () => {
    expect(gatedIncomeTypes({ job: 'Selbstständig' })).toEqual(['Gewerbe'])
    expect(gatedIncomeTypes({ job: 'Beides' })).toEqual(['Gewerbe'])
  })

  it('Angestellt alone gates nothing', () => {
    expect(gatedIncomeTypes({ job: 'Angestellt' })).toEqual([])
  })

  it('Kapital is gated ONLY for the Krypto broker (ADR-032); DE/foreign brokers are computable', () => {
    const base: Answers = { job: 'Angestellt', einkuenfte: 'Kapitalerträge' }
    expect(gatedIncomeTypes({ ...base, 'kap-depot': 'Deutscher Broker' })).toEqual([])
    expect(gatedIncomeTypes({ ...base, 'kap-depot': 'Ausländischer Broker' })).toEqual([])
    expect(gatedIncomeTypes({ ...base, 'kap-depot': 'Krypto' })).toEqual(['Kapital'])
  })

  it('Vermietung is gated ONLY for "Verkauf oder möbliert" (ADR-033); Einfach/Mehrere are computable', () => {
    const base: Answers = { job: 'Angestellt', einkuenfte: 'Vermietung' }
    expect(gatedIncomeTypes({ ...base, 'vermietung-art': 'Einfach' })).toEqual([])
    expect(gatedIncomeTypes({ ...base, 'vermietung-art': 'Mehrere' })).toEqual([])
    expect(gatedIncomeTypes({ ...base, 'vermietung-art': 'Verkauf oder möbliert' })).toEqual(['Vermietung'])
  })

  it('gates only what is DECLARED — a Krypto answer with no Kapitalerträge declared gates nothing', () => {
    expect(gatedIncomeTypes({ job: 'Angestellt', 'kap-depot': 'Krypto' })).toEqual([])
  })
})
