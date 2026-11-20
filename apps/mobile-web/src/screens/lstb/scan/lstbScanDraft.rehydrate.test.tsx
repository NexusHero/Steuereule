import type { AdvisorChatMessageDto, LstbExtractedFieldDto } from '@steuereule/api-client'
import { describe, expect, it } from 'vitest'
import { buildFieldDraft, evaluateStagedDraft, rehydrateDraftFromAdvisorMessages } from './lstbScanDraft'

function extracted(over: Partial<LstbExtractedFieldDto>): LstbExtractedFieldDto {
  return { value: 1000, status: 'ok', ...over } as LstbExtractedFieldDto
}

describe('buildFieldDraft', () => {
  it('rounds the read value to whole euros and confirms a green field', () => {
    expect(buildFieldDraft(extracted({ value: 48000.4 }))).toMatchObject({ text: '48000', status: 'ok', confirmed: true, sourceLines: [], calculation: [], reason: null })
  })

  it('leaves an unreadable value empty and asks for a check instead of confirming it', () => {
    expect(buildFieldDraft(extracted({ value: null, status: 'pruefen' }))).toMatchObject({ text: '', status: 'pruefen', confirmed: false })
    expect(buildFieldDraft(extracted({ value: Number.NaN, status: 'pruefen' })).text).toBe('')
  })

  it('keeps the source lines and the calculation for the user to inspect', () => {
    const draft = buildFieldDraft(extracted({ sourceLines: ['Zeile 3'], calculation: [{ label: 'a', value: 1 }] as never, reason: 'unsicher' as never }))
    expect(draft.sourceLines).toEqual(['Zeile 3'])
    expect(draft.calculation).toHaveLength(1)
    expect(draft.reason).toBe('unsicher')
  })
})

function message(meta: unknown): AdvisorChatMessageDto {
  return { meta } as unknown as AdvisorChatMessageDto
}

const pendingAction = (field: string, newValue: string, extra: object = {}) => ({ screen: 'lstb', field, newValue, status: 'pending', ...extra })

describe('rehydrateDraftFromAdvisorMessages (Zero-Write: a reload restores the pending scan)', () => {
  const scan = { stage: 'deterministic', person: 'A', receiptId: 'r1', taxYearOnDocument: 2025, actionIds: ['a1'] }

  it('restores the latest pending scan of the expected person', () => {
    const draft = rehydrateDraftFromAdvisorMessages(
      [message({ lstbScan: scan, actions: [pendingAction('bruttoarbeitslohn', '48000'), pendingAction('lohnsteuer', '7600', { confidenceStatus: 'pruefen' })] })],
      'A',
    )
    expect(draft).toMatchObject({ stage: 'deterministic', receiptId: 'r1', taxYearOnDocument: 2025, actionIds: ['a1'] })
    expect(draft?.fields.bruttoarbeitslohn).toMatchObject({ text: '48000', status: 'ok', confirmed: true })
    expect(draft?.fields.lohnsteuer).toMatchObject({ text: '7600', status: 'pruefen', confirmed: false })
    expect(draft?.fields.sozialversicherung).toMatchObject({ text: '', status: 'ok' })
    expect(evaluateStagedDraft(draft).socialInsuranceOpen).toBe(true)
  })

  it('defaults a missing person to A and a missing receipt / year to null', () => {
    const draft = rehydrateDraftFromAdvisorMessages([message({ lstbScan: { stage: 'llm_text_fallback', actionIds: [] }, actions: [pendingAction('lohnsteuer', '1')] })], 'A')
    expect(draft).toMatchObject({ stage: 'llm_text_fallback', receiptId: null, taxYearOnDocument: null })
  })

  it('does not hand a scan of Person A to Person B', () => {
    const messages = [message({ lstbScan: scan, actions: [pendingAction('lohnsteuer', '1')] })]
    expect(rehydrateDraftFromAdvisorMessages(messages, 'B')).toBeNull()
  })

  it('returns nothing once every action was applied or rejected', () => {
    const messages = [message({ lstbScan: scan, actions: [{ screen: 'lstb', field: 'lohnsteuer', status: 'applied' }] })]
    expect(rehydrateDraftFromAdvisorMessages(messages, 'A')).toBeNull()
  })

  it('skips messages without scan meta, actions or lstb actions and falls back to an older pending scan', () => {
    const older = message({ lstbScan: scan, actions: [pendingAction('bruttoarbeitslohn', '5')] })
    const messages = [
      older,
      message({ lstbScan: scan, actions: [{ screen: 'commute', field: 'x', status: 'pending' }] }),
      message({ lstbScan: scan, actions: [] }),
      message({ actions: [pendingAction('lohnsteuer', '1')] }),
      { } as AdvisorChatMessageDto,
    ]
    expect(rehydrateDraftFromAdvisorMessages(messages, 'A')?.fields.bruttoarbeitslohn.text).toBe('5')
  })

  it('returns nothing for an empty conversation', () => {
    expect(rehydrateDraftFromAdvisorMessages([], 'A')).toBeNull()
  })
})

describe('evaluateStagedDraft without a draft', () => {
  it('is not ready and has nothing to confirm', () => {
    expect(evaluateStagedDraft(null)).toMatchObject({ readyToApply: false, allIntegers: false, socialInsuranceOpen: false, liveStatus: null, hasWiderspruch: false, hasUnconfirmedYellow: false })
  })
})
