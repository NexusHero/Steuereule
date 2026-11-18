import { describe, expect, it } from 'vitest'
import { carriedPlan, latestPlan, openPlanNote, openPlanSteps, planOfMeta } from './advisor-plan'
import type { AdvisorPlanStep } from './ki-port'

const plan: AdvisorPlanStep[] = [
  { text: 'Arbeitsweg erfassen', status: 'erledigt' },
  { text: 'Krankenversicherung von Person B erfassen', status: 'offen' },
  { text: 'Spenden prüfen', status: 'laeuft' },
]

describe('planOfMeta', () => {
  it('reads the stored plan of an answer', () => {
    expect(planOfMeta({ plan })).toEqual(plan)
  })

  it('reads nothing from an answer without a plan, or from a stored shape it does not know', () => {
    expect(planOfMeta(null)).toBeNull()
    expect(planOfMeta({})).toBeNull()
    expect(planOfMeta({ plan: 'Spenden' })).toBeNull()
    expect(planOfMeta({ plan: [{ text: 'Spenden', status: 'vielleicht' }] })).toBeNull()
    expect(planOfMeta({ plan: [] })).toBeNull()
  })
})

describe('latestPlan', () => {
  it('takes the plan of the newest answer that has one, so an answer that forgot the plan does not lose it', () => {
    const records = [
      { role: 'assistant' as const, meta: { plan: [{ text: 'Alt', status: 'offen' as const }] } },
      { role: 'user' as const, meta: null },
      { role: 'assistant' as const, meta: { plan } },
      { role: 'user' as const, meta: null },
      { role: 'assistant' as const, meta: {} },
    ]
    expect(latestPlan(records)).toEqual(plan)
  })

  it('ignores a plan on a user message and finds none in a conversation without one', () => {
    expect(latestPlan([{ role: 'user', meta: { plan } as never }])).toBeNull()
    expect(latestPlan([])).toBeNull()
  })
})

describe('openPlanSteps', () => {
  it('keeps the steps not done yet, running ones included', () => {
    expect(openPlanSteps(plan).map((step) => step.text)).toEqual(['Krankenversicherung von Person B erfassen', 'Spenden prüfen'])
    expect(openPlanSteps(null)).toEqual([])
  })
})

describe('carriedPlan', () => {
  it('stores the plan of this turn when the model made one, even when it is all done', () => {
    const done = plan.map((step) => ({ ...step, status: 'erledigt' as const }))
    expect(carriedPlan(done, plan)).toEqual(done)
  })

  it('carries the earlier plan on while it still has open steps and the model did not update it', () => {
    expect(carriedPlan(null, plan)).toEqual(plan)
  })

  it('drops an earlier plan that is all done', () => {
    expect(carriedPlan(null, [{ text: 'Arbeitsweg erfassen', status: 'erledigt' }])).toBeNull()
    expect(carriedPlan(null, null)).toBeNull()
  })
})

describe('openPlanNote', () => {
  it('names every open step when the answer leaves them out', () => {
    expect(openPlanNote(plan, 'Ich habe den Arbeitsweg als Entwurf vorbereitet.')).toBe('\n\nNoch offen: Krankenversicherung von Person B erfassen, Spenden prüfen.')
  })

  it('says nothing when the answer already names the open steps, in its own words', () => {
    expect(openPlanNote(plan, 'Als Nächstes: die Krankenversicherung von Person B und deine Spenden.')).toBe('')
  })

  it('names all open steps when the answer names only some of them', () => {
    expect(openPlanNote(plan, 'Als Nächstes kommt die Krankenversicherung von Person B.')).toBe('\n\nNoch offen: Krankenversicherung von Person B erfassen, Spenden prüfen.')
  })

  it('says nothing without a plan or when everything is done', () => {
    expect(openPlanNote(null, 'Fertig.')).toBe('')
    expect(openPlanNote([{ text: 'Spenden prüfen', status: 'erledigt' }], 'Fertig.')).toBe('')
  })
})
