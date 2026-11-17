// Real-data run, finding 4: a child could not be created through the chat, so Kinderfreibetrag,
// Kindergeld comparison and childcare were missing. End to end through the AdvisorService with the
// real LangGraph engine and the scripted fake model (#450 D8): the consent card appears whatever the
// model does, and after the consent the child and its amounts reach the estimate exactly as the
// Kinder mask does it.
import type { AdvisorActionProposal, AdvisorMessageMeta, AdvisorStreamEvent } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { EnvAiRuntimeConfigService } from '../src/ki/ai-runtime-config.service.js'
import { createChatModelFromConfig } from '../src/ki/chat-model.factory.js'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import type { MasterDataRecord } from '../src/master-data/master-data.repository.js'
import type { TaxEstimateStatus } from '../src/tax-estimate/tax-estimate.service.js'
import { buildAdvisorTestKit, collect, type AdvisorTestKit } from './fakes/advisor-test-kit.js'

const USER = 'user-child'
const YEAR = 2025
const CHILD_MESSAGE = 'Unsere Tochter ist geboren am 9. März 2021. Kindergeld, Schweizer Kinderzulage, Kita und Krankenkasse nenne ich dir gleich.'

function fakeModelKit(): AdvisorTestKit {
  const engine = new LangGraphAdvisorEngine(new EnvAiRuntimeConfigService({ AI_FAKE_KI: '1', NODE_ENV: 'test' }), createChatModelFromConfig)
  return buildAdvisorTestKit(engine, undefined, { withEstimate: true })
}

/** A married couple filing jointly, both employed; no child recorded yet. */
async function jointCouple(kit: AdvisorTestKit): Promise<void> {
  kit.interviewRepo.seed(USER, YEAR, { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Verheiratet' })
  await kit.masterDataRepo.save(USER, { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
  await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' })
  await kit.linkService.updatePersonB(USER, YEAR, { firstName: 'Bea', lastName: 'Muster' })
  const spouse = await kit.linkService.dataUser(USER, YEAR, 'B')
  kit.lstbRepo.seed({ userId: USER, taxYear: YEAR, bruttoarbeitslohn: '95000', lohnsteuer: '17000', sozialversicherung: '14000' })
  kit.lstbRepo.seed({ userId: spouse, taxYear: YEAR, bruttoarbeitslohn: '60000', lohnsteuer: '9000', sozialversicherung: '11000' })
}

const metaOf = (events: readonly AdvisorStreamEvent[]): AdvisorMessageMeta => {
  const done = events.find((e) => e.event === 'done')
  if (!done) throw new Error('the turn did not finish')
  return (done.data as { assistantMessage: { meta: AdvisorMessageMeta } }).assistantMessage.meta
}

const draftsOf = (meta: AdvisorMessageMeta): AdvisorActionProposal[] => [...(meta.action ? [meta.action] : []), ...(meta.actions ?? [])]

const computed = (status: TaxEstimateStatus) => {
  if (status.kind !== 'spanne') throw new Error(`expected an estimate, got ${JSON.stringify(status)}`)
  return status
}

async function say(kit: AdvisorTestKit, message: string, replaceFromMessageId?: string) {
  return collect(kit.service.streamMessage(USER, YEAR, { message, ...(replaceFromMessageId ? { replaceFromMessageId } : {}) }))
}

describe('a child through the chat (ADR-0091, real-data run finding 4)', () => {
  it('shows the consent card when the user names a child, and stages nothing without the consent', async () => {
    const kit = fakeModelKit()
    await jointCouple(kit)
    const meta = metaOf(await say(kit, CHILD_MESSAGE))
    expect(meta.personalDataConsentRequest).toBe(true)
    expect(draftsOf(meta).filter((draft) => draft.screen === 'kind')).toHaveLength(0)
    expect(await kit.childRepo.listForUserAndYear(USER, YEAR)).toHaveLength(0)
  })

  it('shows the card when the model only talks about the consent, without any tool call', async () => {
    const kit = fakeModelKit()
    await jointCouple(kit)
    // The fake model answers its fixed text here; the card comes from what the user wrote.
    const meta = metaOf(await say(kit, 'Meine Frau heißt Bea, wir wohnen in der Musterstraße 12.'))
    expect(meta.personalDataConsentRequest).toBe(true)
  })

  it('shows the card when the owl asks for it with its tool', async () => {
    const kit = fakeModelKit()
    const meta = metaOf(await say(kit, 'Darfst du persönliche Daten eintragen?'))
    expect(meta.personalDataConsentRequest).toBe(true)
    expect(meta.thoughtSteps?.some((step) => step.kind === 'tool' && step.tool === 'request_personal_data_consent')).toBe(true)
  })

  it('after the consent the same message is answered again, and the child reaches the estimate', async () => {
    const kit = fakeModelKit()
    await jointCouple(kit)
    const before = computed(await kit.taxEstimate.getState(USER, YEAR))

    const first = await say(kit, CHILD_MESSAGE)
    expect(metaOf(first).personalDataConsentRequest).toBe(true)
    const question = (first.find((e) => e.event === 'done')!.data as { userMessage: { id: string } }).userMessage.id

    // „Erlauben“ on the card, then the chat sends the same words again in place of the refused turn.
    await kit.consent.set(USER, true)
    const meta = metaOf(await say(kit, CHILD_MESSAGE, question))
    expect(meta.personalDataConsentRequest).toBeUndefined()
    expect(meta.notStaged).toBeUndefined()
    const drafts = draftsOf(meta).filter((draft) => draft.screen === 'kind')
    expect(drafts.map((draft) => draft.field)).toEqual(['firstName', 'childBenefitClaimEur', 'swissFamilyAllowanceEur', 'childcareEur', 'healthBasicEur'])

    await kit.service.applyBatch(USER, YEAR, { drafts: drafts.map((draft) => ({ actionId: draft.actionId })) })
    const children = await kit.childRepo.listForUserAndYear(USER, YEAR)
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({
      firstName: 'Mila',
      geburtsdatum: '2021-03-09',
      childBenefitClaimEur: '660',
      kinship: '1',
      kinshipB: '1',
      swissFamilyAllowanceEur: '2400',
      swissFamilyAllowancePayer: 'A',
      childcareEur: '6000',
      childcareProvider: 'Kita, Gemeinde Musterdorf',
      healthBasicEur: '1200',
    })

    const after = computed(await kit.taxEstimate.getState(USER, YEAR))
    // Childcare: 80 % of 6.000 € = 4.800 € Sonderausgaben (§ 10 Abs. 1 Nr. 5 EStG) instead of the 72 € lump sum.
    expect(before.specialExpenses).toBe(72)
    expect(after.specialExpenses).toBe(4800)
    // At this income the Kinderfreibetrag beats the Kindergeld (§ 31 EStG): the taxable income falls
    // by the allowance (9.600 €) on top of the childcare, and the claim to Kindergeld is added back.
    expect(before.taxableIncome.from - after.taxableIncome.from).toBe(4800 - 72 + 9600)
    expect(after.result.from).toBeGreaterThan(before.result.from)
  })

  it('the Kinder mask with the same child gives the same estimate as the chat', async () => {
    const chat = fakeModelKit()
    await jointCouple(chat)
    await chat.consent.set(USER, true)
    const drafts = draftsOf(metaOf(await say(chat, CHILD_MESSAGE))).filter((draft) => draft.screen === 'kind')
    await chat.service.applyBatch(USER, YEAR, { drafts: drafts.map((draft) => ({ actionId: draft.actionId })) })

    const mask = fakeModelKit()
    await jointCouple(mask)
    await mask.children.create(USER, YEAR, {
      firstName: 'Mila',
      lastName: 'Muster',
      geburtsdatum: '2021-03-09',
      childBenefitClaimEur: '660',
      kinship: '1',
      kinshipB: '1',
      swissFamilyAllowanceEur: '2400',
      swissFamilyAllowancePayer: 'A',
      childcareEur: '6000',
      childcareProvider: 'Kita, Gemeinde Musterdorf',
      childcareFrom: '01.01.2025',
      childcareTo: '31.12.2025',
      healthBasicEur: '1200',
    })

    const strip = ({ id: _id, ...rest }: Record<string, unknown>) => rest
    const [chatChild] = await chat.childRepo.listForUserAndYear(USER, YEAR)
    const [maskChild] = await mask.childRepo.listForUserAndYear(USER, YEAR)
    expect(strip(chatChild as unknown as Record<string, unknown>)).toEqual(strip(maskChild as unknown as Record<string, unknown>))
    expect(await chat.taxEstimate.getState(USER, YEAR)).toEqual(await mask.taxEstimate.getState(USER, YEAR))

    // § 31 Satz 4 EStG: the comparison counts the claim to Kindergeld for the months, not what was
    // paid. Entering the full 3.060 € instead of the 660 € Differenzkindergeld changes nothing.
    await mask.children.update(USER, YEAR, maskChild!.id, { childBenefitClaimEur: '3060' })
    expect(await mask.taxEstimate.getState(USER, YEAR)).toEqual(await chat.taxEstimate.getState(USER, YEAR))
  })

  it('lets the owl read the app’s estimate instead of adding figures up herself (finding 6)', async () => {
    const kit = fakeModelKit()
    await jointCouple(kit)
    const meta = metaOf(await say(kit, 'Was kommt am Ende heraus?'))
    const estimate = computed(await kit.taxEstimate.getState(USER, YEAR))
    const step = meta.thoughtSteps?.find((entry) => entry.kind === 'tool' && entry.tool === 'read_current_estimate')
    expect(step).toBeDefined()
    expect(JSON.stringify(step)).toContain(new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(estimate.result.from))))
  })
})
