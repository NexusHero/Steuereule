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
