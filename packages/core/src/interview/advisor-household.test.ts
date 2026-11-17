import { describe, expect, it } from 'vitest'
import { PERSON_B_HANDLE, checkDraftPerson, describeHouseholdForPrompt, draftPersonKey, type AdvisorHousehold } from './advisor-household'

const recordable: AdvisorHousehold = { personB: { handle: PERSON_B_HANDLE, recordable: true, figures: null } }
const ownAccount: AdvisorHousehold = { personB: { handle: PERSON_B_HANDLE, recordable: false, figures: null } }

describe('which drafts may be made for Person B', () => {
  it('lets a draft for the user alone through, whatever the household', () => {
    expect(checkDraftPerson(undefined, 'A', 'commute')).toEqual({ ok: true })
    expect(checkDraftPerson(undefined, undefined, 'kind')).toEqual({ ok: true })
  })

  it("routes B's own masks to B in a joint return entered by A", () => {
    for (const screen of ['lstb', 'chLohnausweis', 'commute', 'rente'] as const) {
      expect(checkDraftPerson(recordable, 'B', screen)).toEqual({ ok: true })
    }
  })

  it('refuses B without a joint return', () => {
    const check = checkDraftPerson({ personB: null }, 'B', 'commute')
    expect(check).toMatchObject({ ok: false, code: 'NO_PERSON_B' })
    expect(checkDraftPerson(undefined, 'B', 'commute')).toMatchObject({ ok: false, code: 'NO_PERSON_B' })
  })

  it('refuses B with an own account, as the mask does', () => {
    const check = checkDraftPerson(ownAccount, 'B', 'lstb')
    expect(check).toMatchObject({ ok: false, code: 'PERSON_B_OWNS_DATA' })
    if (!check.ok) expect(check.reason).toMatch(/eigenen Konto/)
  })

  it('refuses B on a mask of the joint return (children, rentals, interview)', () => {
    for (const screen of ['kind', 'vermietung', 'interview', 'kapital'] as const) {
      expect(checkDraftPerson(recordable, 'B', screen)).toMatchObject({ ok: false, code: 'JOINT_SCREEN' })
    }
  })
})

describe('Person B\'s own Grenzgänger answers (ADR-0091, Nachtrag)', () => {
  it('lets the owl draft B\'s residence and non-return days in B\'s interview, and nothing else of it', () => {
    for (const field of ['ch-wohnsitz', 'ch-nichtrueckkehrtage', ' ch-wohnsitz ']) expect(checkDraftPerson(recordable, 'B', 'interview', field)).toEqual({ ok: true })
    for (const field of ['job', 'kinder', undefined]) expect(checkDraftPerson(recordable, 'B', 'interview', field)).toMatchObject({ ok: false, code: 'JOINT_SCREEN' })
    expect(checkDraftPerson(ownAccount, 'B', 'interview', 'ch-wohnsitz')).toMatchObject({ ok: false, code: 'PERSON_B_OWNS_DATA' })
  })

  it('tells the model about them', () => {
    expect(describeHouseholdForPrompt(recordable)).toContain('`interview.ch-wohnsitz`')
  })
})

describe('Person B\'s own identity (ADR-0091)', () => {
  it('lets the owl draft B\'s name, Steuer-ID and master data on B\'s own profile', () => {
    for (const screen of ['profil', 'stammdaten'] as const) {
      expect(checkDraftPerson(recordable, 'B', screen)).toEqual({ ok: true })
    }
  })
})

describe('the target of a draft names the person', () => {
  it('keeps A drafts as they were and sets B drafts apart', () => {
    expect(draftPersonKey(undefined, 'commute.oneWayKm')).toBe('commute.oneWayKm')
    expect(draftPersonKey('A', 'commute.oneWayKm')).toBe('commute.oneWayKm')
    expect(draftPersonKey('B', 'commute.oneWayKm')).toBe('B:commute.oneWayKm')
  })
})

describe('what the case prompt says about the household', () => {
  it('names Person B, the masks and the figures, never a name', () => {
    const text = describeHouseholdForPrompt({ personB: { handle: PERSON_B_HANDLE, recordable: true, figures: { grossWageEur: null, grossWageChf: 84000, commuteKm: 24, pensionAnnualEur: null } } })
    expect(text).toContain('person: "B"')
    expect(text).toContain('chLohnausweis')
    expect(text).toContain('84000 CHF')
    expect(text).toContain('24 km')
  })

  it('tells the owl not to draft for B without a joint return or when B keeps an own account', () => {
    expect(describeHouseholdForPrompt(undefined)).toMatch(/keine Zusammenveranlagung/)
    expect(describeHouseholdForPrompt({ personB: { handle: PERSON_B_HANDLE, recordable: false, figures: null } })).toMatch(/eigenes Konto/)
  })
})

// Real-data runs 2024/2025: three drafts for the spouse came without `person` and would have overwritten the
// user's own value („Person B: Name → Büsra“, „Büsra, Arbeitsweg Schaffhausen 26 km“, „Helsana … Büsra“).
describe('whose value a draft is, in a joint return (no silent default to the user)', () => {
  const named: AdvisorHousehold = { personB: { handle: PERSON_B_HANDLE, recordable: true, figures: null, aliases: ['Büsra', 'Büsra Sevinc'] } }

  it('asks for the person on a mask that exists once per spouse, and on B\'s own interview answers', () => {
    for (const screen of ['commute', 'chLohnausweis', 'lstb', 'rente', 'profil', 'stammdaten'] as const) {
      expect(checkDraftPerson(recordable, undefined, screen)).toMatchObject({ ok: false, code: 'PERSON_REQUIRED' })
      expect(checkDraftPerson(recordable, 'A', screen)).toEqual({ ok: true })
    }
    expect(checkDraftPerson(recordable, undefined, 'interview', 'ch-wohnsitz')).toMatchObject({ ok: false, code: 'PERSON_REQUIRED' })
  })

  it('does not ask on the joint masks, nor without a spouse the user records for', () => {
    expect(checkDraftPerson(recordable, undefined, 'kind')).toEqual({ ok: true })
    expect(checkDraftPerson(recordable, undefined, 'interview', 'job')).toEqual({ ok: true })
    expect(checkDraftPerson({ personB: null }, undefined, 'commute')).toEqual({ ok: true })
    expect(checkDraftPerson(ownAccount, undefined, 'commute')).toEqual({ ok: true })
  })

  it('refuses a draft for the user whose title names the spouse, by handle or by name', () => {
    for (const label of ['Person B: Name', 'Büsra, Arbeitsweg Schaffhausen: 26 km', 'Helsana Grundversicherung (KVG) 2024, büsra']) {
      expect(checkDraftPerson(named, 'A', 'commute', undefined, label)).toMatchObject({ ok: false, code: 'PERSON_MISMATCH' })
    }
    expect(checkDraftPerson(named, 'B', 'commute', undefined, 'Büsra, Arbeitsweg Schaffhausen: 26 km')).toEqual({ ok: true })
    expect(checkDraftPerson(named, 'A', 'commute', undefined, 'Arbeitsweg Zürich: 67 km')).toEqual({ ok: true })
    // A name inside another word is no mention; a joint mask may name both.
    expect(checkDraftPerson(named, 'A', 'commute', undefined, 'Arbeitsweg Büsrastrasse')).toEqual({ ok: true })
    expect(checkDraftPerson(named, undefined, 'kind', undefined, 'Zeynep: anderer Elternteil Büsra')).toEqual({ ok: true })
  })

  it('never puts the spouse\'s real name into the case prompt', () => {
    expect(describeHouseholdForPrompt(named)).not.toMatch(/Büsra/)
    expect(describeHouseholdForPrompt(named)).toMatch(/`person: "A"`/)
  })
})
