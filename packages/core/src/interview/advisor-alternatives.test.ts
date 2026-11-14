import { describe, expect, it } from 'vitest'
import { alternativeKeyOf, conflictingAlternatives, withTwoPathsGroup, withoutAlternativesOf } from './advisor-alternatives'
import type { AdvisorActionProposal, AdvisorTwoPathsProposal } from './advisor'

const draft = (actionId: string, extra: Partial<AdvisorActionProposal> = {}): AdvisorActionProposal => ({
  actionId,
  status: 'pending',
  screen: 'interview',
  field: 'spenden-betrag',
  instance: null,
  label: actionId,
  previousValue: null,
  newValue: '1',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: '',
  sourceId: 'estg-10b',
  ...extra,
})

describe('alternative drafts', () => {
  it('lets drafts on different fields go together', () => {
    expect(conflictingAlternatives([draft('a'), draft('b', { field: 'weg' })])).toEqual([])
  })

  it('treats two drafts on the same field as alternatives', () => {
    const groups = conflictingAlternatives([draft('a'), draft('b'), draft('c', { field: 'weg' })])
    expect(groups.map((g) => g.map((d) => d.actionId))).toEqual([['a', 'b']])
  })

  it('keeps the same field of the user and of the spouse apart', () => {
    expect(conflictingAlternatives([draft('a'), draft('b', { person: 'B' })])).toEqual([])
  })

  it('treats an explicit group as exclusive even across fields', () => {
    const groups = conflictingAlternatives([draft('a', { alternativeGroup: 'g' }), draft('b', { field: 'weg', alternativeGroup: 'g' })])
    expect(groups).toHaveLength(1)
  })

  it('drops the alternatives of the chosen draft and keeps the rest', () => {
    const a = draft('a', { alternativeGroup: 'g' })
    const b = draft('b', { field: 'weg', alternativeGroup: 'g' })
    const c = draft('c', { field: 'tage' })
    expect(withoutAlternativesOf([a, b, c], a).map((d) => d.actionId)).toEqual(['c'])
  })

  it('gives both paths of a stored comparison one group', () => {
    const twoPaths: AdvisorTwoPathsProposal = {
      title: 't',
      sourceId: 'estg-4-5-6c',
      safePath: draft('x-safe', { field: 'homeoffice' }),
      maxPath: { ...draft('x-max', { field: 'arbeitszimmer' }), evidenceHint: 'h' },
    }
    const grouped = withTwoPathsGroup(twoPaths)
    expect(alternativeKeyOf(grouped.safePath)).toBe(alternativeKeyOf(grouped.maxPath))
    expect(grouped.maxPath.evidenceHint).toBe('h')
  })
})
