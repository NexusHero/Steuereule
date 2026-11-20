import { describe, expect, it } from 'vitest'
import { suggestProfessionKind, type ProfessionAnswers } from './profession'

const base: ProfessionAnswers = { ownExpertWork: true, employsQualifiedStaff: false, leadsPersonally: true, tradesGoods: false }

describe('Freiberuf or Gewerbe (§§ 15, 18 EStG)', () => {
  it('lets a prior assessment win over every answer', () => {
    const result = suggestProfessionKind({ ...base, catalogProfession: 'architekt', priorAssessment: 'gewerbe' })
    expect(result.suggestion).toBe('gewerbe')
    expect(result.basis).toEqual(['letzter Einkommensteuerbescheid'])
  })

  it('suggests Freiberuf for a Katalogberuf and a free activity', () => {
    expect(suggestProfessionKind({ ...base, catalogProfession: 'uebersetzer' })).toMatchObject({ suggestion: 'freiberuf', basis: ['§ 18 Abs. 1 Nr. 1 EStG'] })
    expect(suggestProfessionKind({ ...base, freeActivity: 'unterrichtend' }).suggestion).toBe('freiberuf')
  })

  it('keeps the Freiberuf with qualified staff only while the owner leads personally (§ 18 Abs. 1 Nr. 1 Satz 3)', () => {
    expect(suggestProfessionKind({ ...base, catalogProfession: 'ingenieur', employsQualifiedStaff: true, leadsPersonally: true }).suggestion).toBe('freiberuf')
    expect(suggestProfessionKind({ ...base, catalogProfession: 'ingenieur', employsQualifiedStaff: true, leadsPersonally: false }).suggestion).toBe('gewerbe')
  })

  it('treats trading goods as Gewerbe, and a free profession beside it as unclear', () => {
    expect(suggestProfessionKind({ ...base, tradesGoods: true }).suggestion).toBe('gewerbe')
    expect(suggestProfessionKind({ ...base, catalogProfession: 'heilpraktiker', tradesGoods: true }).suggestion).toBe('unklar')
  })

  it('falls back to Gewerbe without any free ground, and to unclear for a similar profession', () => {
    expect(suggestProfessionKind(base).suggestion).toBe('gewerbe')
    expect(suggestProfessionKind({ ...base, similarToCatalogProfession: true }).suggestion).toBe('unklar')
    expect(suggestProfessionKind({ ...base, freeActivity: 'kuenstlerisch', ownExpertWork: false }).suggestion).toBe('gewerbe')
  })
})
