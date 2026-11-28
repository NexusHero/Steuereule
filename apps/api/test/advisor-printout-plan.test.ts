// ADR-0091, Nachtrag: the owl asks for what still blocks the printout. Fast tier, no database.
import { describe, expect, it } from 'vitest'
import type { AdvisorActionProposal, AdvisorMessageMeta } from '@steuereule/core'
import { buildPrintoutPlan, draftsTakenOver, printoutFollowUp, stagedGapKeys } from '../src/advisor/advisor-printout-plan.js'
import { buildCaseBlock, buildStableSystemPrompt } from '../src/ki/advisor-prompt.js'
import { emptyCaseDigest } from './fakes/empty-case-digest.js'

const records = { kind: [{ handle: 'Kind 1', id: 'child-1' }, { handle: 'Kind 2', id: 'child-2' }], vermietung: [] }

const draft = (over: Partial<AdvisorActionProposal>): AdvisorActionProposal =>
  ({ actionId: 'a', screen: 'kind', field: 'kinship', instance: null, newValue: '1', status: 'pending', label: 'x', ...over }) as AdvisorActionProposal

describe('buildPrintoutPlan', () => {
  it('reads A’s fields from the user and B’s from Person B’s data user, children by their id', async () => {
    const calls: Array<{ user: string; keys: readonly string[] }> = []
    const stored: Record<string, Record<string, string>> = {
      user: { 'kind:child-1.kinship': '1', 'kind:child-1.kinshipB': '1', 'kind:child-1.taxId': '1', 'kind:child-1.familyBenefitsOffice': 'FK', 'kind:child-1.domesticResidenceAllYear': 'true' },
      spouse: { 'interview.ch-wohnsitz': 'Deutschland' },
    }
    const plan = await buildPrintoutPlan({
      userId: 'user',
      taxYear: 2025,
      missing: ['kinder', 'grenzgaengerPersonB'],
      spouse: { spouseUserId: 'spouse', recordable: true },
      records,
      personalDataConsent: true,
      read: async (user, _year, keys) => {
        calls.push({ user, keys })
        return Object.fromEntries(keys.map((key) => [key, stored[user]?.[key] ?? null]))
      },
    })
    expect(calls.map((c) => c.user)).toEqual(['user', 'spouse'])
    expect(calls[0]!.keys).toContain('kind:child-2.kinshipB')
    expect(calls[1]!.keys).toContain('interview.ch-nichtrueckkehrtage')
    const keys = plan.questions.map((q) => q.key)
    expect(keys.some((key) => key.startsWith('A|kind:Kind 1.'))).toBe(false)
    expect(keys).toContain('A|kind:Kind 2.kinshipB')
    expect(keys).not.toContain('B|interview.ch-wohnsitz')
    expect(keys).toContain('B|interview.ch-nichtrueckkehrtage')
  })

  it('reads nothing of Person B without one, and nothing at all when no gap needs a field', async () => {
    const users: string[] = []
    const read = async (user: string, _year: number, keys: readonly string[]) => {
      users.push(user)
      return Object.fromEntries(keys.map((key) => [key, null]))
    }
    await buildPrintoutPlan({ userId: 'user', taxYear: 2025, missing: ['grenzgaengerPersonB', 'kapital'], spouse: null, records, personalDataConsent: false, read })
    expect(users).toEqual(['user'])
    users.length = 0
    const plan = await buildPrintoutPlan({ userId: 'user', taxYear: 2025, missing: ['iban', 'anlageSO'], spouse: null, records, personalDataConsent: false, read })
    expect(users).toEqual([])
    expect(plan.questions.map((q) => q.key)).toEqual(['A|stammdaten.iban'])
  })
})

describe('stagedGapKeys and draftsTakenOver', () => {
  it('names a draft’s target and companions by person and record handle', () => {
    const meta: AdvisorMessageMeta = {
      actions: [
        draft({ instance: 'child-2', companionFields: { kinshipB: '1' } }),
        draft({ screen: 'interview', field: 'ch-wohnsitz', person: 'B' }),
        draft({ instance: 'neu:1', field: 'firstName' }),
      ],
    }
    expect(stagedGapKeys(meta, records)).toEqual(['A|kind:Kind 2.kinship', 'A|kind:Kind 2.kinshipB', 'B|interview.ch-wohnsitz', 'A|kind:neu.firstName'])
    expect(stagedGapKeys({ action: draft({ screen: 'kapital', field: 'inhaber' }) }, undefined)).toEqual(['A|kapital.inhaber'])
  })

  it('counts an answer as taken over once a draft is applied and none is pending', () => {
    expect(draftsTakenOver({ actions: [draft({ status: 'applied' }), draft({ status: 'dismissed' })] })).toBe(true)
    expect(draftsTakenOver({ actions: [draft({ status: 'applied' }), draft({ status: 'pending' })] })).toBe(false)
    expect(draftsTakenOver({ action: draft({ status: 'dismissed' }) })).toBe(false)
    expect(draftsTakenOver(null)).toBe(false)
  })
})

describe('printoutFollowUp', () => {
  const plan = { questions: [], unplanned: [] }
  it('says nothing without a plan or a trigger', () => {
    expect(printoutFollowUp({ plan: undefined, message: 'Fehlt noch etwas?', reply: '', meta: {}, records, previous: undefined })).toEqual({ text: '', meta: {} })
    expect(printoutFollowUp({ plan, message: 'Danke!', reply: '', meta: {}, records, previous: undefined })).toEqual({ text: '', meta: {} })
    // Asked, with nothing open: the app says so, the answer is never empty.
    expect(printoutFollowUp({ plan, message: 'Fehlt noch etwas?', reply: '', meta: {}, records, previous: undefined }).text).toContain('fehlt für den Ausdruck nichts mehr')
  })
})

const DIGEST = emptyCaseDigest(
  {
    printoutGaps: ['Kapitalerträge: …'],
    printoutPlan: {
      questions: [
        { code: 'kapital', screen: 'interview', field: 'kap-depot', person: 'A', key: 'A|interview.kap-depot', subject: 'Du', question: 'Liegt das Depot bei einem deutschen Broker?', mask: 'Kapitalerträge', owlMayDraft: true, required: true, keywords: ['broker'] },
      ],
      unplanned: [],
    },
  },
  { filingStatus: 'zusammen' },
)

describe('the checklist in the prompt', () => {
  it('stands as its own list under the case, not inside the digest', () => {
    const text = buildCaseBlock({ digest: DIGEST })
    expect(text).toContain('Ausdruck-Checkliste')
    expect(text).toContain('- Du: Liegt das Depot bei einem deutschen Broker? → `interview.kap-depot`, Pflicht; du darfst den Entwurf vorbereiten')
    expect(text).not.toContain('"printoutPlan"')
    expect(text).toContain('"printoutGaps"')
  })

  it('tells the model when to ask it and to draft what the user already said', () => {
    const rules = buildStableSystemPrompt(true)
    expect(rules).toContain('Ausdruck-Checkliste')
    expect(rules).toContain('`chLohnausweis.nGreSonderfaelle` „false“')
  })
})
