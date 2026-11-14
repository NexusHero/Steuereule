import { describe, expect, it } from 'vitest'
import { withPreviewedEffects } from './advisor-effect'
import type { AdvisorActionProposal } from './advisor'
import type { AdvisorPreviewTarget } from './ki-port'

const draft: AdvisorActionProposal = {
  actionId: 'a',
  status: 'pending',
  screen: 'commute',
  field: 'homeOfficeDays',
  instance: null,
  label: 'Homeoffice-Tage: 80',
  previousValue: null,
  newValue: '80',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  effect: 'not-computable',
  effectHint: 'offen',
  reason: '',
  sourceId: 'estg-4-5-6c',
}

describe('fallback drafts get their effect from the estimate (K3)', () => {
  it('takes before, after and delta from the preview of exactly the fields the draft writes', async () => {
    const targets: AdvisorPreviewTarget[] = []
    const meta = await withPreviewedEffects({ action: draft }, async (target) => {
      targets.push(target)
      return { kind: 'computed', beforeRefundEur: 300, afterRefundEur: 420, deltaEur: 120 }
    })
    expect(targets).toEqual([{ screen: 'commute', instance: null, values: [['homeOfficeDays', '80']] }])
    expect(meta.action).toMatchObject({ beforeRefundEur: 300, afterRefundEur: 420, deltaEur: 120, effect: 'computed' })
    expect(meta.action?.effectHint).toBeUndefined()
  })

  it('names no figure while the return cannot be estimated', async () => {
    const meta = await withPreviewedEffects({ action: { ...draft, effect: undefined, deltaEur: 692 } }, async () => ({
      kind: 'not-computable',
      hint: 'Wirkung erst berechenbar …',
    }))
    expect(meta.action).toMatchObject({ deltaEur: 0, effect: 'not-computable', effectHint: 'Wirkung erst berechenbar …' })
  })

  it('treats a failing preview as open, and leaves drafts alone without a preview', async () => {
    const failed = await withPreviewedEffects({ actions: [draft] }, async () => {
      throw new Error('db down')
    })
    expect(failed.actions?.[0]?.effect).toBe('not-computable')
    const untouched = { action: draft }
    expect(await withPreviewedEffects(untouched, undefined)).toBe(untouched)
  })
})
