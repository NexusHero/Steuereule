// Drafts staged from an uploaded document (real-data run, Lauf 4): the effect a card names comes from
// the app's estimate, and a Swiss wage statement asks for what the certificate does not say.
import { describe, expect, it } from 'vitest'
import type { AdvisorPreviewEffect, AdvisorPreviewTarget } from '@steuereule/core'
import { buildAdvisorTestKit } from './fakes/advisor-test-kit.js'

const USER = 'user-staging'
const YEAR = 2024
const RULES = { mode: 'deterministic_fallback', provider: 'deterministic' } as const

/** The estimate's preview as the API module offers it; in-memory setups have none of their own. */
function withPreview(kit: ReturnType<typeof buildAdvisorTestKit>, preview: (target: AdvisorPreviewTarget) => AdvisorPreviewEffect): AdvisorPreviewTarget[] {
  const seen: AdvisorPreviewTarget[] = []
  kit.caseDigest.previewEffectFor = () => async (target: AdvisorPreviewTarget) => {
    seen.push(target)
    return preview(target)
  }
  return seen
}

describe('the effect on a card read from a receipt', () => {
  it('is the estimate’s own before and after, not a figure made up from the digest', async () => {
    const kit = buildAdvisorTestKit()
    const seen = withPreview(kit, () => ({ kind: 'computed', beforeRefundEur: -4, afterRefundEur: 201, deltaEur: 205 }))
    const { action } = await kit.service.stageReceiptProposal(USER, YEAR, {
      screen: 'interview',
      field: 'haushalt-handwerker-betrag',
      newValue: '1025',
      companionFields: { 'haushalt-gate': 'Ja', 'haushalt-handwerker-rechnungsbetrag': '1400' },
      label: 'Handwerkerleistung',
      reason: 'Vom Beleg gelesen',
      sourceId: 'estg-35a',
      summaryText: 'Rechnung gelesen.',
      engine: RULES,
    })
    expect(action).toMatchObject({ effect: 'computed', beforeRefundEur: -4, afterRefundEur: 201, deltaEur: 205 })
    // The preview writes what „Übernehmen“ would write: the companions first, the amount last.
    expect(seen[0]!.values.map(([field]) => field)).toEqual(['haushalt-gate', 'haushalt-handwerker-rechnungsbetrag', 'haushalt-handwerker-betrag'])
  })

  it('says that there is no figure when the estimate cannot name one', async () => {
    const kit = buildAdvisorTestKit()
    withPreview(kit, () => ({ kind: 'not-computable', hint: 'Wirkung erst berechenbar, wenn die Angaben vollständig sind.' }))
    const { action } = await kit.service.stageReceiptProposal(USER, YEAR, { screen: 'interview', field: 'spenden-betrag', newValue: '300', label: 'Spende', reason: 'Vom Beleg gelesen', sourceId: 'estg-10b', summaryText: 'Spende gelesen.', engine: RULES })
    expect(action).toMatchObject({ effect: 'not-computable', beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, effectHint: 'Wirkung erst berechenbar, wenn die Angaben vollständig sind.' })
  })

  it('prices every draft of a document the same way', async () => {
    const kit = buildAdvisorTestKit()
    withPreview(kit, (target) => ({ kind: 'computed', beforeRefundEur: -4, afterRefundEur: target.values[0]![0] === 'krankenkasseChf' ? 310 : -4, deltaEur: target.values[0]![0] === 'krankenkasseChf' ? 314 : 0 }))
    const { actions } = await kit.service.stageDocumentDrafts(USER, YEAR, {
      screen: 'chLohnausweis', person: 'A', digestUserId: USER, receiptId: null, engine: RULES, summaryText: 'Gelesen.', sourceId: 'estg-10-1-3',
      fields: [
        { field: 'krankenkasseChf', label: 'Krankenkasse', value: 2100, status: 'ok', reason: null },
        { field: 'quellensteuer', label: 'Quellensteuer', value: 4100, status: 'ok', reason: null },
      ],
    })
    expect(actions.map((a) => [a.field, a.effect, a.beforeRefundEur, a.afterRefundEur])).toEqual([
      ['krankenkasseChf', 'computed', -4, 310],
      ['quellensteuer', 'computed', -4, -4],
    ])
  })
})

describe('a Swiss wage statement read from a document', () => {
  const wage = (kit: ReturnType<typeof buildAdvisorTestKit>, summaryText = 'Lohnausweis gelesen.') =>
    kit.service.stageDocumentDrafts(USER, YEAR, {
      screen: 'chLohnausweis', person: 'A', digestUserId: USER, receiptId: null, engine: RULES, summaryText, sourceId: 'estg-9-1',
      fields: [{ field: 'bruttolohn-total', label: 'Bruttolohn (Ziffer 8)', value: 98000, status: 'ok', reason: null }],
    })

  it('asks where a daily benefit in the gross wage came from, with the six answers', async () => {
    const kit = buildAdvisorTestKit()
    const { assistantMessage } = await wage(kit)
    expect(assistantMessage.content).toContain('Lohnausweis gelesen.')
    expect(assistantMessage.content).toContain('Woher kam das Taggeld im Bruttolohn (Ziffer 8)')
    expect(assistantMessage.content).toContain('Krankentaggeldversicherung (mit dem Lohn verrechnet)')
    expect(assistantMessage.content).toContain('Lohnfortzahlung des Arbeitgebers ohne Versicherung')
  })

  it('does not ask again once the source is recorded', async () => {
    const kit = buildAdvisorTestKit()
    await kit.chRepo.setNGre(USER, YEAR, { taggeldQuelle: 'kein' })
    const { assistantMessage } = await wage(kit)
    expect(assistantMessage.content).toBe('Lohnausweis gelesen.')
  })

  it('offers a sickness benefit a remark carries as two paths, the deduction as the insurance, with the AHV hint', async () => {
    const kit = buildAdvisorTestKit()
    const { assistantMessage } = await kit.service.stageDocumentDrafts(USER, 2025, {
      screen: 'chLohnausweis', person: 'A', digestUserId: USER, receiptId: null, engine: RULES, summaryText: 'Lohnausweis gelesen.', sourceId: 'estg-9-1',
      fields: [
        { field: 'bruttolohn-total', label: 'Bruttolohn', value: 90000, status: 'ok', reason: null },
        { field: 'ahv-beitraege', label: 'AHV/IV/EO/ALV/NBUV', value: 5380, status: 'ok', reason: null },
      ],
      dailyBenefit: { kind: 'sickness', amountChf: 6000 },
    })
    // The owl proposes, the user picks (ADR-0093): taking the deduction records the answer „Versicherung“ too.
    expect(assistantMessage.meta?.twoPaths).toMatchObject({
      safePath: { field: 'steuerfreiesKrankentaggeldChf', newValue: '0' },
      maxPath: { field: 'steuerfreiesKrankentaggeldChf', newValue: '6000', companionFields: { taggeldQuelle: 'krankentaggeldversicherung' } },
    })
    expect(assistantMessage.meta?.twoPaths?.safePath.companionFields).toBeUndefined()
    expect(assistantMessage.content).toContain('Woher kam das Taggeld')
    expect(assistantMessage.content).toContain('Hinweis zur Plausibilität (keine Entscheidung)')
    expect(assistantMessage.content).toContain('ohne das Taggeld')
  })

  it('does not ask again once the answer is recorded, also as 0', async () => {
    const kit = buildAdvisorTestKit()
    await kit.chRepo.setNGre(USER, YEAR, { steuerfreiesKrankentaggeldChf: '0' })
    const { assistantMessage } = await wage(kit)
    expect(assistantMessage.content).toBe('Lohnausweis gelesen.')
  })

  it('does not ask again once an accident benefit (UVG/SUVA) is recorded on its own field', async () => {
    const kit = buildAdvisorTestKit()
    await kit.chRepo.setNGre(USER, YEAR, { steuerfreiesUnfalltaggeldChf: '2250' })
    const { assistantMessage } = await wage(kit)
    expect(assistantMessage.content).toBe('Lohnausweis gelesen.')
  })

  it('offers an accident benefit a remark carries as two paths on the accident field', async () => {
    const kit = buildAdvisorTestKit()
    const { assistantMessage } = await kit.service.stageDocumentDrafts(USER, YEAR, {
      screen: 'chLohnausweis', person: 'A', digestUserId: USER, receiptId: null, engine: RULES, summaryText: 'Lohnausweis gelesen.', sourceId: 'estg-10-1-3',
      fields: [{ field: 'bruttolohn-total', label: 'Bruttolohn', value: 98000, status: 'ok', reason: null }],
      dailyBenefit: { kind: 'accident', amountChf: 2250 },
    })
    expect(assistantMessage.meta?.twoPaths).toMatchObject({
      safePath: { field: 'steuerfreiesUnfalltaggeldChf', newValue: '0', label: 'Unfalltaggeld nicht abziehen' },
      maxPath: { field: 'steuerfreiesUnfalltaggeldChf', newValue: '2250' },
    })
    expect(assistantMessage.meta?.twoPaths?.maxPath.evidenceHint).toContain('Bescheinigung des Arbeitgebers')
    expect(assistantMessage.meta?.twoPaths?.maxPath.companionFields).toEqual({ taggeldQuelle: 'unfallversicherung' })
    expect(assistantMessage.content).toContain('beide Wege')
  })

  it('asks nothing of the kind for another document', async () => {
    const kit = buildAdvisorTestKit()
    const { assistantMessage } = await kit.service.stageDocumentDrafts(USER, YEAR, {
      screen: 'chLohnausweis', person: 'A', digestUserId: USER, receiptId: null, engine: RULES, summaryText: 'Prämie gelesen.', sourceId: 'estg-10-1-3',
      fields: [{ field: 'krankenkasseChf', label: 'Krankenkasse', value: 2100, status: 'ok', reason: null }],
    })
    expect(assistantMessage.content).toBe('Prämie gelesen.')
  })
})
