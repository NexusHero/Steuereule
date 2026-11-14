import { describe, expect, it } from 'vitest'
import { effectLeftOutOfEstimate } from '../src/advisor/advisor-shared.js'

describe('drafts the estimate does not count yet (#443 slice 5)', () => {
  const craftsmen = { screen: 'interview' as const, instance: null, values: [['haushalt-gate', 'Ja'], ['haushalt-handwerker-betrag', '800']] as const }

  it('are not shown as "0 €" while the § 35a / § 33 boosters are off', () => {
    expect(effectLeftOutOfEstimate(craftsmen, false)).toMatchObject({ kind: 'not-computable' })
    expect(effectLeftOutOfEstimate({ ...craftsmen, values: [['gesundheit-betrag', '1200']] }, false)).toMatchObject({ kind: 'not-computable' })
  })

  it('leave every other draft and the switched-on estimate alone', () => {
    expect(effectLeftOutOfEstimate(craftsmen, true)).toBeNull()
    expect(effectLeftOutOfEstimate({ screen: 'interview', instance: null, values: [['fortbildung-kosten', '500']] }, false)).toBeNull()
    expect(effectLeftOutOfEstimate({ screen: 'commute', instance: null, values: [['distanceKm', '20']] }, false)).toBeNull()
  })
})
